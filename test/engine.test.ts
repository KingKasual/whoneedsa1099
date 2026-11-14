import { describe, expect, it } from 'vitest';
import { FEDERAL, STATES, evaluatePayee, evaluateAll, summarize, round2 } from '../src/rules';
import type { FederalRules, PayeeInput, StateTable } from '../src/rules';
import fixtures from './fixtures/irs-examples.json';

function payee(p: Partial<PayeeInput> & Pick<PayeeInput, 'payments'>): PayeeInput {
  return { id: 'p1', name: 'Test Payee', category: 'services', isCorporation: 'no', hasTin: 'yes', ...p };
}

describe('IRS example fixtures', () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      const v = evaluatePayee(payee(c.payee as unknown as PayeeInput), FEDERAL);
      expect(v.status).toBe(c.expect.status);
      expect(v.forms).toEqual(c.expect.forms);
      for (const id of (c.expect as { reasonIds?: string[] }).reasonIds ?? []) {
        expect(v.reasons.map((r) => r.ruleId)).toContain(id);
      }
      // Every reason cites a source.
      for (const r of [...v.reasons, ...v.warnings]) expect(r.source).toMatch(/^https:\/\//);
    });
  }
});

describe('engine details', () => {
  it('excluded payee short-circuits', () => {
    const v = evaluatePayee(payee({ category: 'excluded', payments: [{ date: '2026-01-01', amount: 9999, method: 'bank' }] }), FEDERAL);
    expect(v.status).toBe('no_file');
    expect(v.excludedAmount).toBe(9999);
    expect(v.reasons[0]?.ruleId).toBe('EXCLUDED_BY_USER');
  });

  it('per-payment excluded category is subtracted', () => {
    const v = evaluatePayee(
      payee({ payments: [{ date: '2026-01-01', amount: 1500, method: 'bank' }, { date: '2026-01-02', amount: 1000, method: 'bank', category: 'excluded' }] }),
      FEDERAL,
    );
    expect(v.status).toBe('no_file');
    expect(v.reasons.map((r) => r.ruleId)).toContain('EXCLUDED_BY_USER');
  });

  it('ignores zero and negative amounts', () => {
    const v = evaluatePayee(payee({ payments: [{ date: '2026-01-01', amount: 0, method: 'bank' }, { date: '2026-01-01', amount: -5, method: 'bank' }] }), FEDERAL);
    expect(v.totalPaid).toBe(0);
    expect(v.warnings).toEqual([]);
  });

  it('unknown category is treated as services and flagged for review', () => {
    const v = evaluatePayee(payee({ category: 'unknown', payments: [{ date: '2026-01-01', amount: 2500, method: 'bank' }] }), FEDERAL);
    expect(v.status).toBe('review');
    expect(v.forms[0]?.form).toBe('1099-NEC');
    expect(v.warnings.map((w) => w.ruleId)).toContain('NEEDS_CATEGORY');
  });

  it('unknown corporation status assumes not a corporation', () => {
    const v = evaluatePayee(payee({ isCorporation: 'unknown', payments: [{ date: '2026-01-01', amount: 2500, method: 'bank' }] }), FEDERAL);
    expect(v.status).toBe('file');
    expect(v.reasons.map((r) => r.ruleId)).toContain('CORP_UNKNOWN');
  });

  it('near threshold triggers review', () => {
    const v = evaluatePayee(payee({ payments: [{ date: '2026-01-01', amount: 1850, method: 'bank' }] }), FEDERAL);
    expect(v.status).toBe('review');
    expect(v.warnings.map((w) => w.ruleId)).toContain('NEAR_THRESHOLD');
  });

  it('services + attorney fees combine into one NEC box 1 line', () => {
    const v = evaluatePayee(
      payee({
        payments: [
          { date: '2026-01-01', amount: 1200, method: 'bank' },
          { date: '2026-02-01', amount: 1000, method: 'bank', category: 'attorney_fees' },
        ],
      }),
      FEDERAL,
    );
    expect(v.forms).toEqual([{ form: '1099-NEC', box: '1', amount: 2200 }]);
  });

  it('corporation: services exempt but attorney fees still reported', () => {
    const v = evaluatePayee(
      payee({
        isCorporation: 'yes',
        payments: [
          { date: '2026-01-01', amount: 5000, method: 'bank' },
          { date: '2026-02-01', amount: 2500, method: 'bank', category: 'attorney_fees' },
        ],
      }),
      FEDERAL,
    );
    expect(v.forms).toEqual([{ form: '1099-NEC', box: '1', amount: 2500 }]);
    expect(v.reasons.map((r) => r.ruleId)).toContain('CORP_EXEMPT');
  });

  it('attorney gross proceeds carry a pending-confirmation warning', () => {
    const v = evaluatePayee(payee({ category: 'attorney_proceeds', payments: [{ date: '2026-01-01', amount: 700, method: 'check' }] }), FEDERAL);
    expect(v.status).toBe('file');
    expect(v.warnings.some((w) => w.ruleId === 'MISC_ATTORNEY_PROCEEDS')).toBe(true);
  });

  it('other income -> MISC box 3', () => {
    const v = evaluatePayee(payee({ category: 'other_income', payments: [{ date: '2026-01-01', amount: 2000, method: 'check' }] }), FEDERAL);
    expect(v.forms).toEqual([{ form: '1099-MISC', box: '3', amount: 2000 }]);
  });

  describe('backup withholding / W-9', () => {
    it('reportable payee with no TIN -> critical backup withholding warning', () => {
      const v = evaluatePayee(payee({ hasTin: 'no', payments: [{ date: '2026-01-01', amount: 3000, method: 'bank' }] }), FEDERAL);
      const w = v.warnings.find((x) => x.ruleId === 'BACKUP_WITHHOLDING');
      expect(w?.severity).toBe('critical');
    });
    it('below threshold with no TIN -> collect W-9 info (default config)', () => {
      const v = evaluatePayee(payee({ hasTin: 'unknown', payments: [{ date: '2026-01-01', amount: 500, method: 'bank' }] }), FEDERAL);
      expect(v.warnings.map((w) => w.ruleId)).toEqual(['COLLECT_W9']);
    });
    it('below threshold with no TIN -> backup withholding when config says it applies', () => {
      const rules: FederalRules = structuredClone(FEDERAL);
      rules.rules.BACKUP_WITHHOLDING!.appliesBelowThreshold = true;
      const v = evaluatePayee(payee({ hasTin: 'no', payments: [{ date: '2026-01-01', amount: 500, method: 'bank' }] }), rules);
      expect(v.warnings.map((w) => w.ruleId)).toContain('BACKUP_WITHHOLDING');
    });
    it('card-only payee with no TIN gets no W-9 warning', () => {
      const v = evaluatePayee(payee({ hasTin: 'no', payments: [{ date: '2026-01-01', amount: 500, method: 'card' }] }), FEDERAL);
      expect(v.warnings).toEqual([]);
    });
  });

  describe('state check', () => {
    it('flags an unverified income-tax state at the conservative fallback', () => {
      const v = evaluatePayee(payee({ state: 'NY', payments: [{ date: '2026-01-01', amount: 900, method: 'bank' }] }), FEDERAL, STATES);
      expect(v.status).toBe('review');
      const w = v.warnings.find((x) => x.ruleId === 'STATE_LOWER_THRESHOLD');
      expect(w?.text).toMatch(/New York/);
      expect(w?.text).toMatch(/not yet verified/);
      expect(w?.source).toBe('https://www.tax.ny.gov/');
    });
    it('does not flag no-income-tax states', () => {
      const v = evaluatePayee(payee({ state: 'TX', payments: [{ date: '2026-01-01', amount: 900, method: 'bank' }] }), FEDERAL, STATES);
      expect(v.status).toBe('no_file');
    });
    it('verified state uses its own threshold', () => {
      const t: StateTable = structuredClone(STATES);
      const ca = t.states.find((s) => s.code === 'CA')!;
      ca.status = 'verified';
      const v = evaluatePayee(payee({ state: 'CA', payments: [{ date: '2026-01-01', amount: 900, method: 'bank' }] }), FEDERAL, t);
      expect(v.status).toBe('no_file');
      const ms = t.states.find((s) => s.code === 'MS')!;
      ms.status = 'verified';
      const v2 = evaluatePayee(payee({ state: 'MS', payments: [{ date: '2026-01-01', amount: 900, method: 'bank' }] }), FEDERAL, t);
      expect(v2.status).toBe('review');
      expect(v2.warnings.find((w) => w.ruleId === 'STATE_LOWER_THRESHOLD')?.text).not.toMatch(/not yet verified/);
    });
    it('verified state with null threshold falls back conservatively', () => {
      const t: StateTable = structuredClone(STATES);
      const ny = t.states.find((s) => s.code === 'NY')!;
      ny.status = 'verified';
      const v = evaluatePayee(payee({ state: 'NY', payments: [{ date: '2026-01-01', amount: 700, method: 'bank' }] }), FEDERAL, t);
      expect(v.status).toBe('review');
    });
    it('unknown state code is ignored; reportable payees are not state-flagged', () => {
      expect(evaluatePayee(payee({ state: 'ZZ', payments: [{ date: '2026-01-01', amount: 900, method: 'bank' }] }), FEDERAL, STATES).status).toBe('no_file');
      const v = evaluatePayee(payee({ state: 'NY', payments: [{ date: '2026-01-01', amount: 5000, method: 'bank' }] }), FEDERAL, STATES);
      expect(v.warnings.map((w) => w.ruleId)).not.toContain('STATE_LOWER_THRESHOLD');
    });
  });

  it('throws on unknown rule ids and missing amounts (config errors surface loudly)', () => {
    const broken: FederalRules = structuredClone(FEDERAL);
    delete broken.rules.OUT_OF_YEAR;
    expect(() => evaluatePayee(payee({ payments: [{ date: '2020-01-01', amount: 1, method: 'bank' }] }), broken)).toThrow(/Unknown rule/);
    const noAmt: FederalRules = structuredClone(FEDERAL);
    delete noAmt.rules.NEC_THRESHOLD!.amount;
    expect(() => evaluatePayee(payee({ payments: [{ date: '2026-01-01', amount: 1, method: 'bank' }] }), noAmt)).toThrow(/no amount/);
  });

  it('evaluateAll + summarize', () => {
    const vs = evaluateAll(
      [
        payee({ id: 'a', payments: [{ date: '2026-01-01', amount: 3000, method: 'bank' }] }),
        payee({ id: 'b', category: 'rent', payments: [{ date: '2026-01-01', amount: 3000, method: 'bank' }] }),
        payee({ id: 'c', payments: [{ date: '2026-01-01', amount: 100, method: 'bank' }] }),
        payee({ id: 'd', category: 'unknown', payments: [{ date: '2026-01-01', amount: 100, method: 'bank' }] }),
      ],
      FEDERAL,
    );
    expect(summarize(vs)).toEqual({ file: 2, review: 1, no_file: 1, nec: 1, misc: 1 });
  });

  it('round2 avoids float drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('data integrity', () => {
  it('state table has 50 unique states, each with an https source', () => {
    expect(STATES.states).toHaveLength(50);
    expect(new Set(STATES.states.map((s) => s.code)).size).toBe(50);
    for (const s of STATES.states) {
      expect(s.sourceUrl).toMatch(/^https:\/\//);
      expect(['verify', 'verified']).toContain(s.status);
      if (s.status === 'verified') expect(s.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it('every federal rule has a source', () => {
    for (const r of Object.values(FEDERAL.rules)) expect(r.source).toMatch(/^https:\/\/www\.irs\.gov\//);
  });
  it('NEC deadline is Feb 1, 2027 (Jan 31 is a Sunday)', () => {
    expect(new Date('2027-01-31T12:00:00Z').getUTCDay()).toBe(0);
    expect(FEDERAL.deadlines.find((d) => d.id === 'nec')?.date).toBe('2027-02-01');
  });
});
