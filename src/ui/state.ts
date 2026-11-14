import type { Category, PayeeInput, TriState, Verdict } from '../rules/types';
import { FEDERAL, STATES, evaluatePayee } from '../rules';
import type { PayeeGroup } from '../parse/group';
import type { Party } from '../export/iris';
import type { W9Status } from '../export/w9';

export interface Tags {
  category: Category;
  isCorporation: TriState;
  hasTin: TriState;
}

export interface Row {
  group: PayeeGroup;
  tags: Tags;
  input: PayeeInput;
  verdict: Verdict;
}

export interface PayeeMeta {
  w9: W9Status;
  requestedOn?: string;
  email?: string;
  recipient: Party;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  unknown: 'Not tagged yet',
  services: 'Services / labor',
  attorney_fees: 'Legal services (attorney)',
  attorney_proceeds: 'Settlement paid to attorney',
  rent: 'Rent',
  royalties: 'Royalties',
  other_income: 'Prizes / other income',
  goods: 'Goods / merchandise',
  excluded: 'Not a payee (transfer, tax, payroll…)',
};

export const STATUS_LABEL = { file: 'Needs a 1099', review: 'Needs review', no_file: 'No 1099' } as const;

export function emptyParty(nameType: 'B' | 'I' = 'I'): Party {
  return { tinType: '', tin: '', nameType, businessName: '', firstName: '', lastName: '', country: 'US', address1: '', city: '', state: '', zip: '' };
}

export function buildRows(groups: PayeeGroup[], tags: Record<string, Tags>, payerState: string): Row[] {
  return groups.map((g) => {
    const t = tags[g.key] ?? { category: g.suggestedCategory, isCorporation: g.suggestedCorp, hasTin: 'unknown' as TriState };
    const input: PayeeInput = {
      id: g.id,
      name: g.displayName,
      category: t.category,
      isCorporation: t.isCorporation,
      hasTin: t.hasTin,
      payments: g.txns.map((x) => ({ date: x.date, amount: x.amount, method: x.method })),
      ...(payerState ? { state: payerState } : {}),
    };
    return { group: g, tags: t, input, verdict: evaluatePayee(input, FEDERAL, STATES) };
  });
}

export const money = (n: number): string => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
