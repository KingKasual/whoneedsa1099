/**
 * Template-driven IRIS Taxpayer Portal CSV generator + validator. Pure.
 * The template JSON decides headers/order; swapping templates needs no code change.
 */
import type { FormId, Verdict } from '../rules/types';

export interface IrisColumn {
  header: string;
  /** Field id from FIELD_CATALOG, or "const:<value>". */
  field: string;
}

export interface IrisTemplate {
  form: FormId;
  taxYear: number;
  status: 'placeholder' | 'official';
  importedFrom: string | null;
  importedAt: string | null;
  maxRecordsPerFile: number;
  rules: {
    nameChars: string;
    addressChars: string;
    dateFormat: 'MM/DD/YYYY';
    moneyPattern: string;
    maxLengths: { name: number; address: number; city: number; accountNumber: number; phone: number };
  };
  columns: IrisColumn[];
}

export interface Party {
  tinType: 'EIN' | 'SSN' | '';
  tin: string;
  nameType: 'B' | 'I';
  businessName: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  country: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  accountNumber?: string;
}

export interface IrisRecord {
  payeeId: string;
  displayName: string;
  recipient: Party;
  verdict: Verdict;
  withheld?: number;
}

export type FieldKind = 'tin' | 'tinType' | 'nameType' | 'name' | 'address' | 'city' | 'state' | 'zip' | 'country' | 'phone' | 'account' | 'money' | 'year' | 'date';

export const FIELD_CATALOG: Record<string, FieldKind> = {
  'form.taxYear': 'year',
  'payer.tinType': 'tinType',
  'payer.tin': 'tin',
  'payer.nameType': 'nameType',
  'payer.businessName': 'name',
  'payer.firstName': 'name',
  'payer.lastName': 'name',
  'payer.country': 'country',
  'payer.address1': 'address',
  'payer.address2': 'address',
  'payer.city': 'city',
  'payer.state': 'state',
  'payer.zip': 'zip',
  'payer.phone': 'phone',
  'recipient.tinType': 'tinType',
  'recipient.tin': 'tin',
  'recipient.nameType': 'nameType',
  'recipient.businessName': 'name',
  'recipient.firstName': 'name',
  'recipient.middleName': 'name',
  'recipient.lastName': 'name',
  'recipient.suffix': 'name',
  'recipient.country': 'country',
  'recipient.address1': 'address',
  'recipient.address2': 'address',
  'recipient.city': 'city',
  'recipient.state': 'state',
  'recipient.zip': 'zip',
  'recipient.accountNumber': 'account',
  'box.nec1': 'money',
  'box.misc1': 'money',
  'box.misc2': 'money',
  'box.misc3': 'money',
  'box.misc10': 'money',
  'box.withheld': 'money',
  'form.date': 'date',
};

const REQUIRED = new Set([
  'form.taxYear',
  'payer.tinType',
  'payer.tin',
  'payer.nameType',
  'payer.address1',
  'payer.city',
  'payer.state',
  'payer.zip',
  'recipient.tinType',
  'recipient.tin',
  'recipient.nameType',
  'recipient.address1',
  'recipient.city',
  'recipient.state',
  'recipient.zip',
]);

export const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI AA AE AP'.split(' '),
);

export interface FieldIssue {
  header: string;
  message: string;
}

/** Make a value IRIS-safe where it can be done without changing meaning; report what changed. */
export function sanitize(kind: FieldKind, value: string): string {
  let v = value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  switch (kind) {
    case 'name':
      return v.replace(/[.,'"’]/g, '').replace(/\s+/g, ' ').trim();
    case 'address':
    case 'city':
      return v.replace(/[.,#'"’]/g, '').replace(/\s+/g, ' ').trim();
    case 'tin':
    case 'phone':
      return v.replace(/\D/g, '');
    case 'zip':
      v = v.replace(/[^\d]/g, '');
      return v.length === 9 ? v : v.slice(0, 5);
    case 'state':
    case 'country':
    case 'nameType':
    case 'tinType':
      return v.toUpperCase();
    default:
      return v;
  }
}

export function formatMoney(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

export function validateField(tpl: IrisTemplate, field: string, header: string, value: string, form: Party['nameType'] | undefined): FieldIssue[] {
  const kind = FIELD_CATALOG[field];
  const out: FieldIssue[] = [];
  const err = (message: string) => out.push({ header, message });
  if (!kind) return out;
  if (value === '') {
    if (REQUIRED.has(field)) err('is required');
    if ((field === 'recipient.businessName' || field === 'payer.businessName') && form === 'B') err('is required for a business name type');
    if ((field === 'recipient.lastName' || field === 'payer.lastName') && form === 'I') err('is required for an individual name type');
    return out;
  }
  const ml = tpl.rules.maxLengths;
  switch (kind) {
    case 'tin':
      if (!/^\d{9}$/.test(value)) err('must be exactly 9 digits');
      else if (/^0{9}$|^(\d)\1{8}$/.test(value) || value === '123456789') err('is not a valid TIN');
      break;
    case 'tinType':
      if (!['EIN', 'SSN'].includes(value)) err('must be EIN or SSN');
      break;
    case 'nameType':
      if (!['B', 'I'].includes(value)) err('must be B (business) or I (individual)');
      break;
    case 'name':
      if (!new RegExp(tpl.rules.nameChars).test(value)) err('contains characters IRIS does not allow');
      if (value.length > ml.name) err(`is longer than ${ml.name} characters`);
      break;
    case 'address':
    case 'city':
      if (!new RegExp(tpl.rules.addressChars).test(value)) err('contains characters IRIS does not allow');
      if (value.length > (kind === 'city' ? ml.city : ml.address)) err('is too long');
      break;
    case 'state':
      if (!US_STATES.has(value)) err('must be a 2-letter US state/territory code');
      break;
    case 'zip':
      if (!/^\d{5}(\d{4})?$/.test(value)) err('must be 5 or 9 digits');
      break;
    case 'country':
      if (value !== 'US') err('only US addresses are supported by this export');
      break;
    case 'phone':
      if (!/^\d{10,15}$/.test(value)) err('must be 10-15 digits');
      break;
    case 'account':
      if (!/^[A-Za-z0-9]*$/.test(value) || value.length > ml.accountNumber) err('must be letters/digits only and short');
      break;
    case 'money':
      if (!new RegExp(tpl.rules.moneyPattern).test(value)) err('must be a plain number with 2 decimals');
      break;
    case 'year':
      if (value !== String(tpl.taxYear)) err(`must be ${tpl.taxYear}`);
      break;
    case 'date':
      if (!/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(value)) err('must be MM/DD/YYYY');
      break;
  }
  return out;
}

function boxAmount(rec: IrisRecord, form: FormId, box: string): number {
  return rec.verdict.forms.filter((f) => f.form === form && f.box === box).reduce((s, f) => s + f.amount, 0);
}

function resolve(field: string, tpl: IrisTemplate, payer: Party, rec: IrisRecord): string {
  if (field.startsWith('const:')) return field.slice(6);
  const [scope, key] = field.split('.') as [string, string];
  const kind = FIELD_CATALOG[field];
  if (scope === 'form' && key === 'taxYear') return String(tpl.taxYear);
  if (scope === 'box') {
    if (key === 'withheld') return rec.withheld && rec.withheld > 0 ? formatMoney(rec.withheld) : '';
    const form: FormId = key.startsWith('nec') ? '1099-NEC' : '1099-MISC';
    const amt = boxAmount(rec, form, key.replace(/^(nec|misc)/, ''));
    return amt > 0 ? formatMoney(amt) : '';
  }
  const party = scope === 'payer' ? payer : scope === 'recipient' ? rec.recipient : undefined;
  if (!party || !kind) return '';
  const raw = (party as unknown as Record<string, unknown>)[key];
  const v = sanitize(kind, typeof raw === 'string' ? raw : '');
  // Name fields only apply to the chosen name type.
  if (party.nameType === 'B' && /^(firstName|middleName|lastName|suffix)$/.test(key)) return '';
  if (party.nameType === 'I' && key === 'businessName') return '';
  return v;
}

export function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export interface HeldBack {
  payeeId: string;
  displayName: string;
  issues: FieldIssue[];
}

export interface IrisFile {
  name: string;
  csv: string;
  records: number;
}

export interface IrisResult {
  form: FormId;
  files: IrisFile[];
  heldBack: HeldBack[];
  payerIssues: FieldIssue[];
  templateStatus: IrisTemplate['status'];
}

/** Records that belong on this template's form. */
export function recordsForForm(tpl: IrisTemplate, recs: IrisRecord[]): IrisRecord[] {
  return recs.filter((r) => r.verdict.status !== 'no_file' && r.verdict.forms.some((f) => f.form === tpl.form));
}

export function generateIris(tpl: IrisTemplate, payer: Party, recs: IrisRecord[], filePrefix = 'iris'): IrisResult {
  const headers = tpl.columns.map((c) => c.header);
  const payerIssues: FieldIssue[] = [];
  for (const c of tpl.columns) {
    if (!c.field.startsWith('payer.')) continue;
    const v = resolve(c.field, tpl, payer, recs[0] ?? ({ recipient: payer, verdict: { forms: [] } } as unknown as IrisRecord));
    payerIssues.push(...validateField(tpl, c.field, c.header, v, payer.nameType));
  }
  const good: string[][] = [];
  const heldBack: HeldBack[] = [];
  for (const rec of recordsForForm(tpl, recs)) {
    const row: string[] = [];
    const issues: FieldIssue[] = [];
    for (const c of tpl.columns) {
      const v = resolve(c.field, tpl, payer, rec);
      if (c.field.startsWith('recipient.') || c.field.startsWith('box.') || c.field.startsWith('form.')) {
        issues.push(...validateField(tpl, c.field, c.header, v, rec.recipient.nameType));
      }
      row.push(v);
    }
    if (rec.verdict.status === 'review') issues.push({ header: '(verdict)', message: 'payee is marked "needs review"; resolve it before filing' });
    if (issues.length) heldBack.push({ payeeId: rec.payeeId, displayName: rec.displayName, issues });
    else good.push(row);
  }
  const files: IrisFile[] = [];
  if (payerIssues.length === 0) {
    const n = Math.max(1, tpl.maxRecordsPerFile);
    for (let i = 0; i < good.length; i += n) {
      const chunk = good.slice(i, i + n);
      const csv = [headers, ...chunk].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
      const part = Math.floor(i / n) + 1;
      const total = Math.ceil(good.length / n);
      files.push({ name: `${filePrefix}-${tpl.form}-${tpl.taxYear}${total > 1 ? `-part${part}of${total}` : ''}.csv`, csv, records: chunk.length });
    }
  }
  return { form: tpl.form, files, heldBack, payerIssues, templateStatus: tpl.status };
}

/** Build a template from an official IRIS template header row. Unknown headers map to blank. */
const HEADER_RULES: [RegExp, string][] = [
  [/^form type/i, 'const:'],
  [/tax year/i, 'form.taxYear'],
  [/^payer.*tin type/i, 'payer.tinType'],
  [/^payer.*(taxpayer id|\btin\b)/i, 'payer.tin'],
  [/^payer.*name type/i, 'payer.nameType'],
  [/^payer.*(business|entity) name( line 1)?$/i, 'payer.businessName'],
  [/^payer.*first name/i, 'payer.firstName'],
  [/^payer.*last name/i, 'payer.lastName'],
  [/^payer.*country/i, 'payer.country'],
  [/^payer.*address line 1/i, 'payer.address1'],
  [/^payer.*address line 2/i, 'payer.address2'],
  [/^payer.*city/i, 'payer.city'],
  [/^payer.*state/i, 'payer.state'],
  [/^payer.*(zip|postal)/i, 'payer.zip'],
  [/^payer.*phone(?! type)/i, 'payer.phone'],
  [/^recipient.*tin type/i, 'recipient.tinType'],
  [/^recipient.*(taxpayer id|\btin\b)/i, 'recipient.tin'],
  [/^recipient.*name type/i, 'recipient.nameType'],
  [/^recipient.*(business|entity) name( line 1)?$/i, 'recipient.businessName'],
  [/^recipient.*first name/i, 'recipient.firstName'],
  [/^recipient.*middle name/i, 'recipient.middleName'],
  [/^recipient.*last name/i, 'recipient.lastName'],
  [/^recipient.*suffix/i, 'recipient.suffix'],
  [/^recipient.*country/i, 'recipient.country'],
  [/^recipient.*address line 1/i, 'recipient.address1'],
  [/^recipient.*address line 2/i, 'recipient.address2'],
  [/^recipient.*city/i, 'recipient.city'],
  [/^recipient.*state/i, 'recipient.state'],
  [/^recipient.*(zip|postal)/i, 'recipient.zip'],
  [/account number/i, 'recipient.accountNumber'],
  [/box 1\b.*nonemployee/i, 'box.nec1'],
  [/box 1\b.*rents?/i, 'box.misc1'],
  [/box 2\b.*royalt/i, 'box.misc2'],
  [/box 3\b.*other income/i, 'box.misc3'],
  [/box 4\b.*federal income tax withheld/i, 'box.withheld'],
  [/box 10\b.*attorney/i, 'box.misc10'],
];

export function templateFromHeaders(base: IrisTemplate, headers: string[], source: string, now: string): { template: IrisTemplate; unmapped: string[] } {
  const unmapped: string[] = [];
  const columns = headers.map((raw) => {
    const header = raw.replace(/^﻿/, '');
    const hit = HEADER_RULES.find(([re]) => re.test(header.trim()));
    let field = hit ? hit[1] : 'const:';
    if (field === 'const:' && /^form type/i.test(header)) field = `const:${base.form}`;
    if (!hit) unmapped.push(header);
    return { header, field };
  });
  return { template: { ...base, status: 'official', importedFrom: source, importedAt: now, columns }, unmapped };
}
