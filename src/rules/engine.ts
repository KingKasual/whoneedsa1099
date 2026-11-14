/**
 * Pure 1099 rules engine. No I/O, no globals: (payee, rules) -> verdict.
 * Every decision appends a Reason that cites a rule id and source URL.
 */
import type {
  Category,
  FederalRules,
  FormLine,
  PayeeInput,
  Reason,
  StateTable,
  Verdict,
  Warning,
  Severity,
} from './types';

const CARD_APP = new Set(['card', 'app']);

interface Bucket {
  form: FormLine['form'];
  box: string;
  ruleId: string;
  corpExempt: boolean;
}

const BUCKETS: Record<Exclude<Category, 'goods' | 'excluded' | 'unknown'>, Bucket> = {
  services: { form: '1099-NEC', box: '1', ruleId: 'NEC_THRESHOLD', corpExempt: true },
  attorney_fees: { form: '1099-NEC', box: '1', ruleId: 'ATTORNEY_FEES', corpExempt: false },
  attorney_proceeds: { form: '1099-MISC', box: '10', ruleId: 'MISC_ATTORNEY_PROCEEDS', corpExempt: false },
  rent: { form: '1099-MISC', box: '1', ruleId: 'MISC_RENT_THRESHOLD', corpExempt: true },
  royalties: { form: '1099-MISC', box: '2', ruleId: 'MISC_ROYALTY_THRESHOLD', corpExempt: true },
  other_income: { form: '1099-MISC', box: '3', ruleId: 'MISC_OTHER_THRESHOLD', corpExempt: true },
};

export const round2 = (n: number): number => Math.round(n * 100) / 100;

function reason(rules: FederalRules, ruleId: string, amount?: number): Reason {
  const r = rules.rules[ruleId];
  if (!r) throw new Error(`Unknown rule id: ${ruleId}`);
  const out: Reason = { ruleId, title: r.title, text: r.text, source: r.source };
  if (amount !== undefined) out.amount = round2(amount);
  return out;
}

function warning(rules: FederalRules, ruleId: string, severity: Severity, amount?: number): Warning {
  return { ...reason(rules, ruleId, amount), severity };
}

function threshold(rules: FederalRules, ruleId: string): number {
  const amt = rules.rules[ruleId]?.amount;
  if (amt === undefined) throw new Error(`Rule ${ruleId} has no amount`);
  return amt;
}

export function evaluatePayee(payee: PayeeInput, rules: FederalRules, states?: StateTable): Verdict {
  const reasons: Reason[] = [];
  const warnings: Warning[] = [];
  const year = String(rules.taxYear);

  let totalPaid = 0;
  let excluded = 0;
  let outOfYear = 0;
  let cardApp = 0;
  let goods = 0;
  const byBucket = new Map<string, { bucket: Bucket; amount: number }>();
  let assumedServices = false;

  if (payee.category === 'excluded') {
    const total = payee.payments.reduce((s, p) => s + p.amount, 0);
    return {
      payeeId: payee.id,
      status: 'no_file',
      forms: [],
      totalPaid: round2(total),
      excludedAmount: round2(total),
      reasons: [reason(rules, 'EXCLUDED_BY_USER', total)],
      warnings: [],
    };
  }

  for (const p of payee.payments) {
    const amt = p.amount;
    if (!(amt > 0)) continue;
    if (!p.date.startsWith(year)) {
      outOfYear += amt;
      continue;
    }
    totalPaid += amt;
    if (CARD_APP.has(p.method)) {
      cardApp += amt;
      continue;
    }
    let cat: Category = p.category ?? payee.category;
    if (cat === 'goods') {
      goods += amt;
      continue;
    }
    if (cat === 'excluded') {
      excluded += amt;
      continue;
    }
    if (cat === 'unknown') {
      assumedServices = true;
      cat = 'services';
    }
    const bucket = BUCKETS[cat];
    const key = `${bucket.form}|${bucket.box}|${bucket.ruleId}`;
    const cur = byBucket.get(key);
    if (cur) cur.amount += amt;
    else byBucket.set(key, { bucket, amount: amt });
  }

  if (outOfYear > 0) reasons.push(reason(rules, 'OUT_OF_YEAR', outOfYear));
  if (cardApp > 0) reasons.push(reason(rules, 'CARD_APP_EXCLUDED', cardApp));
  if (goods > 0) reasons.push(reason(rules, 'GOODS_EXCLUDED', goods));
  if (excluded > 0) reasons.push(reason(rules, 'EXCLUDED_BY_USER', excluded));
  if (assumedServices) warnings.push(warning(rules, 'NEEDS_CATEGORY', 'warn'));

  const isCorp = payee.isCorporation === 'yes';
  if (payee.isCorporation === 'unknown' && byBucket.size > 0) {
    reasons.push(reason(rules, 'CORP_UNKNOWN'));
  }

  // Merge buckets that land on the same form+box (e.g. services and attorney fees both go to NEC box 1).
  const lines = new Map<string, FormLine & { ruleIds: string[]; reportable: boolean; thresholdMet: boolean }>();
  let nearThreshold = false;
  let corpExempted = false;

  for (const { bucket, amount } of byBucket.values()) {
    if (isCorp && bucket.corpExempt) {
      corpExempted = true;
      continue;
    }
    const k = `${bucket.form}|${bucket.box}`;
    const line = lines.get(k) ?? {
      form: bucket.form,
      box: bucket.box,
      amount: 0,
      ruleIds: [],
      reportable: false,
      thresholdMet: false,
    };
    line.amount += amount;
    line.ruleIds.push(bucket.ruleId);
    lines.set(k, line);
  }
  if (corpExempted) reasons.push(reason(rules, 'CORP_EXEMPT'));

  const forms: FormLine[] = [];
  for (const line of lines.values()) {
    // Use the lowest threshold among rules feeding this box (conservative).
    const t = Math.min(...line.ruleIds.map((id) => threshold(rules, id)));
    const ruleId = line.ruleIds.find((id) => threshold(rules, id) === t) ?? line.ruleIds[0]!;
    const amount = round2(line.amount);
    reasons.push(reason(rules, ruleId, amount));
    if (amount >= t) {
      forms.push({ form: line.form, box: line.box, amount });
      if (rules.rules[ruleId]?.status === 'verify') {
        warnings.push({ ...warning(rules, ruleId, 'warn', amount), title: `${rules.rules[ruleId]?.title ?? ruleId}: threshold pending confirmation` });
      }
    } else if (amount >= t * 0.9) {
      nearThreshold = true;
    }
  }
  if (nearThreshold) warnings.push(warning(rules, 'NEAR_THRESHOLD', 'warn'));

  // Backup withholding / W-9.
  const bw = rules.rules.BACKUP_WITHHOLDING;
  const reportable = forms.length > 0;
  if (payee.hasTin !== 'yes' && lines.size > 0) {
    if (reportable || bw?.appliesBelowThreshold) {
      warnings.push(warning(rules, 'BACKUP_WITHHOLDING', 'critical'));
    } else {
      warnings.push(warning(rules, 'COLLECT_W9', 'info'));
    }
  }

  // State check.
  let stateFlag = false;
  if (states && payee.state && lines.size > 0) {
    const row = states.states.find((s) => s.code === payee.state);
    if (row && row.hasIncomeTax) {
      const stateMin =
        row.status === 'verified' && row.stateThreshold !== null
          ? row.stateThreshold
          : Math.min(row.stateThreshold ?? Infinity, states.conservativeFallbackThreshold);
      const nonExempt = [...lines.values()].reduce((s, l) => s + l.amount, 0);
      if (!reportable && nonExempt >= stateMin) {
        stateFlag = true;
        warnings.push({
          ...warning(rules, 'STATE_LOWER_THRESHOLD', 'warn', nonExempt),
          text: `${row.name}: ${row.notes}${row.status === 'verify' ? ' (State rule not yet verified; flagged conservatively.)' : ''}`,
          source: row.sourceUrl,
        });
      }
    }
  }

  let status: Verdict['status'] = reportable ? 'file' : 'no_file';
  if (assumedServices || (!reportable && (nearThreshold || stateFlag))) status = 'review';

  return {
    payeeId: payee.id,
    status,
    forms,
    totalPaid: round2(totalPaid),
    excludedAmount: round2(cardApp + goods + excluded + outOfYear),
    reasons,
    warnings,
  };
}

export function evaluateAll(payees: PayeeInput[], rules: FederalRules, states?: StateTable): Verdict[] {
  return payees.map((p) => evaluatePayee(p, rules, states));
}

export function summarize(verdicts: Verdict[]): { file: number; review: number; no_file: number; nec: number; misc: number } {
  const out = { file: 0, review: 0, no_file: 0, nec: 0, misc: 0 };
  for (const v of verdicts) {
    out[v.status] += 1;
    if (v.forms.some((f) => f.form === '1099-NEC')) out.nec += 1;
    if (v.forms.some((f) => f.form === '1099-MISC')) out.misc += 1;
  }
  return out;
}
