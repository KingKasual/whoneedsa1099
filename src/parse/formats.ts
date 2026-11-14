/** Export-format signatures and column synonyms. Pure data + detection. */
import type { PayMethod } from '../rules/types';

export type FormatId =
  | 'paypal'
  | 'venmo'
  | 'chase_card'
  | 'amex'
  | 'quickbooks'
  | 'wave'
  | 'xero_bank'
  | 'xero_report'
  | 'bank_generic';

export interface FormatDef {
  id: FormatId;
  label: string;
  /** Lower-cased, trimmed header names must satisfy this. */
  detect: (h: Set<string>) => boolean;
  /** Method for every row unless a row-level hint overrides it. null = infer per row. */
  defaultMethod: PayMethod | null;
  /** How outflows are signed in the single amount column. */
  outflowSign: 'negative' | 'positive' | 'abs';
}

const has = (h: Set<string>, ...names: string[]): boolean => names.every((n) => h.has(n));
const any = (h: Set<string>, ...names: string[]): boolean => names.some((n) => h.has(n));

/** Ordered: most specific first. */
export const FORMATS: FormatDef[] = [
  {
    id: 'paypal',
    label: 'PayPal activity',
    detect: (h) => has(h, 'gross', 'name', 'type', 'status') && any(h, 'transaction id', 'net', 'fee'),
    defaultMethod: 'app',
    outflowSign: 'negative',
  },
  {
    id: 'venmo',
    label: 'Venmo statement',
    detect: (h) => has(h, 'from', 'to') && any(h, 'amount (total)', 'amount (+)', 'amount (-)'),
    defaultMethod: 'app',
    outflowSign: 'negative',
  },
  {
    id: 'chase_card',
    label: 'Credit card (Chase-style)',
    detect: (h) => has(h, 'transaction date', 'post date', 'description', 'amount') && any(h, 'category', 'type'),
    defaultMethod: 'card',
    outflowSign: 'negative',
  },
  {
    id: 'amex',
    label: 'Credit card (Amex-style)',
    detect: (h) => has(h, 'date', 'description', 'amount') && any(h, 'card member', 'account #', 'extended details'),
    defaultMethod: 'card',
    outflowSign: 'positive',
  },
  {
    id: 'quickbooks',
    label: 'QuickBooks report',
    detect: (h) => any(h, 'transaction type', 'type') && any(h, 'name', 'payee', 'vendor') && any(h, 'amount', 'debit', 'total') && any(h, 'num', 'split', 'account', 'memo/description', 'account full name'),
    defaultMethod: null,
    outflowSign: 'abs',
  },
  {
    id: 'wave',
    label: 'Wave account transactions',
    detect: (h) => has(h, 'transaction date', 'account name') && any(h, 'amount (one column)', 'transaction description'),
    defaultMethod: null,
    outflowSign: 'positive',
  },
  {
    id: 'xero_bank',
    label: 'Xero bank statement',
    detect: (h) => any(h, '*date', 'date') && any(h, '*amount', 'amount') && has(h, 'payee') && any(h, 'reference', 'check number', 'cheque no.'),
    defaultMethod: null,
    outflowSign: 'negative',
  },
  {
    id: 'xero_report',
    label: 'Xero account transactions',
    detect: (h) => has(h, 'date', 'source', 'description') && any(h, 'debit', 'credit'),
    defaultMethod: null,
    outflowSign: 'abs',
  },
  {
    id: 'bank_generic',
    label: 'Bank statement',
    detect: (h) => [...h].some((x) => x.includes('date')) && (any(h, 'amount', 'transaction amount') || any(h, 'debit', 'withdrawal', 'withdrawals', 'debit amount')),
    defaultMethod: null,
    outflowSign: 'negative',
  },
];

export const COLS = {
  date: ['*date', 'transaction date', 'trans date', 'txn date', 'date', 'datetime', 'posted date', 'posting date', 'post date'],
  payee: ['payee', 'name', 'vendor', 'to', 'merchant', 'payee name', 'vendor name', 'supplier', 'contact'],
  description: ['description', 'transaction description', 'memo/description', 'memo', 'details', 'narrative', 'transaction line description', 'reference'],
  amount: ['*amount', 'amount', 'gross', 'amount (one column)', 'amount (total)', 'transaction amount', 'total'],
  debit: ['debit', 'debit amount', 'withdrawal', 'withdrawals', 'money out', 'paid out', 'debit amount (two column approach)'],
  credit: ['credit', 'credit amount', 'deposit', 'deposits', 'money in', 'paid in', 'credit amount (two column approach)'],
  method: ['payment method', 'method', 'payment type', 'other accounts for this transaction'],
  type: ['transaction type', 'type', 'source'],
  status: ['status'],
  accountGroup: ['account group', 'account type'],
} as const;

export function normHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function detectFormat(headers: string[]): FormatDef | null {
  const h = new Set(headers.map(normHeader));
  return FORMATS.find((f) => f.detect(h)) ?? null;
}

export function pickCol(headers: string[], candidates: readonly string[]): number {
  const norm = headers.map(normHeader);
  for (const c of candidates) {
    const i = norm.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}
