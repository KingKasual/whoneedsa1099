/** Turn tabular rows (from CSV or XLSX) into outgoing payment transactions. Pure (no file I/O). */
import type { Category, PayMethod } from '../rules/types';
import { COLS, detectFormat, pickCol, type FormatDef, type FormatId } from './formats';
import { categoryHint, methodFromDescription, methodFromLabel } from './names';
import { parseDate, parseMoney } from './values';

export interface Txn {
  id: string;
  date: string;
  amount: number;
  rawName: string;
  description: string;
  method: PayMethod;
  categoryHint: Category | null;
  file: string;
  format: FormatId;
}

export interface ParseOptions {
  /** Flip the sign convention (e.g. a card export where charges are positive). */
  flipSign?: boolean;
  /** Force every row's payment method (e.g. user says "this file is my business credit card"). */
  method?: PayMethod;
}

export interface ParsedFile {
  file: string;
  format: FormatId;
  label: string;
  txns: Txn[];
  skipped: number;
  inflows: number;
  errors: string[];
}

type Cell = string | number | boolean | Date | null | undefined;

const MAX_HEADER_SCAN = 20;

/** Find the header row (reports often have title rows first). */
export function findHeader(rows: Cell[][]): { index: number; format: FormatDef } | null {
  for (let i = 0; i < Math.min(rows.length, MAX_HEADER_SCAN); i++) {
    const row = rows[i];
    if (!row || row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length < 3) continue;
    const f = detectFormat(row.map((c) => String(c ?? '')));
    if (f) return { index: i, format: f };
  }
  return null;
}

const QBO_PAYMENT_TYPES = /^(expense|check|cheque|bill payment.*|credit card expense|cash expense|credit card credit)$/i;
const QBO_CARD_TYPES = /credit card/i;
const PAYPAL_SKIP_TYPES = /transfer|withdrawal|deposit|currency|hold|authori[sz]ation|reversal|refund|conversion|reserve/i;
const XERO_OUT_SOURCES = /spend money|payable payment|bill payment|payment/i;

function str(c: Cell): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
}

export function parseRows(file: string, rows: Cell[][], opts: ParseOptions = {}): ParsedFile {
  const found = findHeader(rows);
  if (!found) {
    return {
      file,
      format: 'bank_generic',
      label: 'Unrecognized',
      txns: [],
      skipped: rows.length,
      inflows: 0,
      errors: ['Could not find a header row with a date column and an amount (or debit) column.'],
    };
  }
  const { index, format } = found;
  const headers = (rows[index] ?? []).map((c) => String(c ?? ''));
  const col = {
    date: pickCol(headers, COLS.date),
    payee: pickCol(headers, COLS.payee),
    description: pickCol(headers, COLS.description),
    amount: pickCol(headers, COLS.amount),
    debit: pickCol(headers, COLS.debit),
    credit: pickCol(headers, COLS.credit),
    method: pickCol(headers, COLS.method),
    type: pickCol(headers, COLS.type),
    status: pickCol(headers, COLS.status),
    accountGroup: pickCol(headers, COLS.accountGroup),
  };
  // Venmo: amount column variants; Xero report: description is the contact.
  if (format.id === 'venmo' && col.amount < 0) col.amount = pickCol(headers, ['amount (total)', 'amount (-)']);

  const out: Txn[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let inflows = 0;

  for (let r = index + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const get = (i: number): Cell => (i >= 0 ? row[i] : undefined);
    if (row.every((c) => str(c) === '')) continue;

    const date = parseDate(get(col.date));
    if (!date) {
      // Totals / section rows in reports have no date; not an error.
      skipped++;
      continue;
    }
    const type = str(get(col.type));
    const status = str(get(col.status));

    // Format-specific filters.
    if (format.id === 'paypal' && ((status && !/completed/i.test(status)) || PAYPAL_SKIP_TYPES.test(type))) {
      skipped++;
      continue;
    }
    if (format.id === 'chase_card' && /^(payment|return|adjustment)$/i.test(type)) {
      skipped++;
      continue;
    }
    if (format.id === 'quickbooks' && type && !QBO_PAYMENT_TYPES.test(type)) {
      skipped++;
      continue;
    }
    if (format.id === 'wave' && col.accountGroup >= 0 && !/expense/i.test(str(get(col.accountGroup)))) {
      skipped++;
      continue;
    }
    if (format.id === 'xero_report' && type && !XERO_OUT_SOURCES.test(type)) {
      skipped++;
      continue;
    }

    // Amount -> positive outflow.
    let amount: number | null = null;
    const single = parseMoney(get(col.amount));
    const debit = parseMoney(get(col.debit));
    const credit = parseMoney(get(col.credit));
    if (format.outflowSign === 'abs') {
      const v = single ?? (debit && debit !== 0 ? debit : credit);
      amount = v === null || v === undefined ? null : Math.abs(v);
    } else if (single !== null && col.amount >= 0) {
      const sign = (format.outflowSign === 'negative' ? -1 : 1) * (opts.flipSign ? -1 : 1);
      amount = single * sign;
    } else if (debit !== null || credit !== null) {
      amount = debit !== null && debit !== 0 ? Math.abs(debit) * (opts.flipSign ? -1 : 1) : -Math.abs(credit ?? 0);
    }
    if (amount === null) {
      errors.push(`Row ${r + 1}: could not read an amount.`);
      skipped++;
      continue;
    }
    if (amount <= 0) {
      inflows++;
      continue;
    }

    const description = str(get(col.description));
    let rawName = str(get(col.payee));
    if (!rawName) rawName = description;
    if (!rawName) {
      errors.push(`Row ${r + 1}: no payee name or description.`);
      skipped++;
      continue;
    }

    const methodLabel = str(get(col.method));
    let method: PayMethod =
      opts.method ??
      format.defaultMethod ??
      methodFromLabel(methodLabel) ??
      (format.id === 'quickbooks' && QBO_CARD_TYPES.test(type) ? 'card' : null) ??
      (format.id === 'quickbooks' && /check|cheque/i.test(type) ? 'check' : null) ??
      methodFromDescription(`${rawName} ${description}`) ??
      (format.id === 'bank_generic' || format.id === 'xero_bank' ? 'bank' : 'unknown');
    if (format.defaultMethod === null && !opts.method && method === 'bank') {
      // A bank row whose description shows a card/app rail is excluded by the engine; keep explicit.
      method = methodFromDescription(`${rawName} ${description}`) ?? 'bank';
    }

    out.push({
      id: `${file}#${r + 1}`,
      date,
      amount: Math.round(amount * 100) / 100,
      rawName,
      description,
      method,
      categoryHint: categoryHint(`${rawName} ${description}`),
      file,
      format: format.id,
    });
  }

  return { file, format: format.id, label: format.label, txns: out, skipped, inflows, errors: errors.slice(0, 20) };
}
