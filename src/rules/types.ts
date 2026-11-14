export type PayMethod = 'bank' | 'check' | 'zelle' | 'ach' | 'cash' | 'card' | 'app' | 'unknown';

export type Category =
  | 'services'
  | 'attorney_fees'
  | 'attorney_proceeds'
  | 'rent'
  | 'royalties'
  | 'other_income'
  | 'goods'
  | 'excluded'
  | 'unknown';

export type TriState = 'yes' | 'no' | 'unknown';

export interface Payment {
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Positive amount paid out, in dollars */
  amount: number;
  method: PayMethod;
  /** Optional per-payment category override; falls back to the payee's category */
  category?: Category;
}

export interface PayeeInput {
  id: string;
  name: string;
  payments: Payment[];
  category: Category;
  isCorporation: TriState;
  hasTin: TriState;
  /** Two-letter state code used for the state check (payee's or payer's, per user setting) */
  state?: string;
}

export type FormId = '1099-NEC' | '1099-MISC';

export interface FormLine {
  form: FormId;
  box: string;
  amount: number;
}

export interface Reason {
  ruleId: string;
  title: string;
  text: string;
  source: string;
  amount?: number;
}

export type VerdictStatus = 'file' | 'no_file' | 'review';
export type Severity = 'info' | 'warn' | 'critical';

export interface Warning extends Reason {
  severity: Severity;
}

export interface Verdict {
  payeeId: string;
  status: VerdictStatus;
  forms: FormLine[];
  totalPaid: number;
  excludedAmount: number;
  reasons: Reason[];
  warnings: Warning[];
}

export interface RuleDef {
  title: string;
  text: string;
  source: string;
  amount?: number;
  rate?: number;
  appliesBelowThreshold?: boolean;
  status?: string;
}

export interface FederalRules {
  version: string;
  taxYear: number;
  rules: Record<string, RuleDef>;
}

export interface StateRow {
  code: string;
  name: string;
  slug: string;
  hasIncomeTax: boolean;
  stateFiling: string;
  conformsToFederal: string;
  stateThreshold: number | null;
  notes: string;
  sourceUrl: string;
  status: 'verify' | 'verified';
  lastReviewed: string | null;
}

export interface StateTable {
  version: string;
  taxYear: number;
  conservativeFallbackThreshold: number;
  states: StateRow[];
}
