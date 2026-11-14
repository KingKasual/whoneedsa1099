/** Group transactions into payees with fuzzy merging. Pure. */
import type { Category, TriState } from '../rules/types';
import { cleanPayeeName, corpHint, nameKey, similarity } from './names';
import type { Txn } from './parse';

export interface PayeeGroup {
  id: string;
  key: string;
  displayName: string;
  aliases: string[];
  txns: Txn[];
  total: number;
  suggestedCategory: Category;
  suggestedCorp: TriState;
}

export const MERGE_THRESHOLD = 0.93;
export const UNNAMED = '(UNNAMED) ';

function mostCommon<T>(items: T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestN = 0;
  for (const it of items) {
    const n = (counts.get(it) ?? 0) + 1;
    counts.set(it, n);
    if (n > bestN) {
      best = it;
      bestN = n;
    }
  }
  return best;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Llc|Inc|Pllc|Llp|Lp|Pc|Pa|Ltd|Corp)\b/g, (m) => m.toUpperCase().replace('CORP', 'Corp'));
}

export function groupPayees(txns: Txn[], threshold = MERGE_THRESHOLD): PayeeGroup[] {
  // 1) exact key buckets
  const buckets = new Map<string, Txn[]>();
  for (const t of txns) {
    // Rows with no usable payee name (e.g. "CHECK 1043") are never merged with each other.
    const key = nameKey(t.rawName) || nameKey(t.description) || `${UNNAMED}${t.id}`;
    const b = buckets.get(key);
    if (b) b.push(t);
    else buckets.set(key, [t]);
  }
  // 2) greedy fuzzy merge, largest buckets first so they become canonical
  const keys = [...buckets.keys()].sort((a, b) => {
    const ta = buckets.get(a)!.reduce((s, t) => s + t.amount, 0);
    const tb = buckets.get(b)!.reduce((s, t) => s + t.amount, 0);
    return tb - ta || a.localeCompare(b);
  });
  const canon: string[] = [];
  const merged = new Map<string, Txn[]>();
  for (const k of keys) {
    const target = k.startsWith(UNNAMED) ? undefined : canon.find((c) => !c.startsWith(UNNAMED) && similarity(c, k) >= threshold);
    if (target) merged.get(target)!.push(...buckets.get(k)!);
    else {
      canon.push(k);
      merged.set(k, [...buckets.get(k)!]);
    }
  }
  // 3) build groups
  return canon.map((key, i) => {
    const ts = merged.get(key)!;
    const cleaned = ts.map((t) => cleanPayeeName(t.rawName) || t.rawName);
    const aliases = [...new Set(ts.map((t) => t.rawName))];
    const hints = ts.map((t) => t.categoryHint).filter((c): c is Category => c !== null);
    const corp: TriState = aliases.some((a) => corpHint(a) === 'yes') ? 'yes' : 'unknown';
    return {
      id: `p${i + 1}`,
      key,
      displayName: key.startsWith(UNNAMED) ? `${ts[0]!.rawName} (payee name not in export)` : titleCase(mostCommon(cleaned) ?? key),
      aliases,
      txns: ts.sort((a, b) => a.date.localeCompare(b.date)),
      total: Math.round(ts.reduce((s, t) => s + t.amount, 0) * 100) / 100,
      suggestedCategory: mostCommon(hints) ?? 'unknown',
      suggestedCorp: corp,
    };
  });
}
