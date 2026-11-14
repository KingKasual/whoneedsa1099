import { describe, expect, it } from 'vitest';
import necTpl from '../src/export/iris-templates/1099-NEC.ty2026.json';
import miscTpl from '../src/export/iris-templates/1099-MISC.ty2026.json';
import { generateIris, sanitize, templateFromHeaders, validateField, formatDate, csvCell, type IrisTemplate, type Party, type IrisRecord } from '../src/export/iris';
import { buildIcs, fold } from '../src/export/ics';
import { w9Email, needsW9, trackerSummary, trackerCsv } from '../src/export/w9';
import { buildSummary } from '../src/export/summary';
import { FEDERAL, evaluatePayee } from '../src/rules';
import type { PayeeInput } from '../src/rules';
import Papa from 'papaparse';

const NEC = necTpl as IrisTemplate;
const MISC = miscTpl as IrisTemplate;

const payer: Party = {
  tinType: 'EIN', tin: '12-3456780', nameType: 'B', businessName: "Dana's Design, LLC", firstName: '', lastName: '',
  country: 'US', address1: '100 Main St.', city: 'Seattle', state: 'wa', zip: '98101', phone: '(206) 555-0100',
};

function rec(id: string, p: Partial<PayeeInput>, recipient: Partial<Party> = {}): IrisRecord {
  const input: PayeeInput = { id, name: id, category: 'services', isCorporation: 'no', hasTin: 'yes', payments: [{ date: '2026-03-01', amount: 2500, method: 'check' }], ...p };
  return {
    payeeId: id,
    displayName: id,
    verdict: evaluatePayee(input, FEDERAL),
    recipient: { tinType: 'SSN', tin: '987-65-4320', nameType: 'I', businessName: '', firstName: 'José', lastName: "O'Brien", country: 'US', address1: '5 Elm St., Apt #2', city: 'Tacoma', state: 'WA', zip: '98402-1234', ...recipient },
  };
}

describe('IRIS export', () => {
  it('writes exact template headers, sanitizes characters, formats money', () => {
    const r = generateIris(NEC, payer, [rec('a', {})]);
    expect(r.payerIssues).toEqual([]);
    expect(r.heldBack).toEqual([]);
    expect(r.files).toHaveLength(1);
    const parsed = Papa.parse<string[]>(r.files[0]!.csv.trim()).data;
    expect(parsed[0]).toEqual(NEC.columns.map((c) => c.header));
    const row = Object.fromEntries(parsed[0]!.map((h, i) => [h, parsed[1]![i]]));
    expect(row['Form Type']).toBe('1099-NEC');
    expect(row['Tax Year']).toBe('2026');
    expect(row['Payer Taxpayer ID Number']).toBe('123456780');
    expect(row['Payer Business or Entity Name Line 1']).toBe('Danas Design LLC');
    expect(row['Payer State/Province/Territory']).toBe('WA');
    expect(row['Recipient First Name']).toBe('Jose');
    expect(row['Recipient Last Name (Surname)']).toBe('OBrien');
    expect(row['Recipient Business or Entity Name Line 1']).toBe('');
    expect(row['Recipient Address Line 1']).toBe('5 Elm St Apt 2');
    expect(row['Recipient ZIP/Postal Code']).toBe('984021234');
    expect(row['Box 1 - Nonemployee Compensation']).toBe('2500.00');
    expect(r.files[0]!.csv.endsWith('\r\n')).toBe(true);
  });

  it('only includes payees for this form; MISC boxes map correctly', () => {
    const recs = [rec('nec', {}), rec('rent', { category: 'rent' }), rec('roy', { category: 'royalties', payments: [{ date: '2026-01-01', amount: 50, method: 'ach' }] }), rec('none', { payments: [{ date: '2026-01-01', amount: 10, method: 'ach' }] })];
    const n = generateIris(NEC, payer, recs);
    expect(n.files[0]!.records).toBe(1);
    const m = generateIris(MISC, payer, recs);
    expect(m.files[0]!.records).toBe(2);
    const rows = Papa.parse<string[]>(m.files[0]!.csv.trim(), { header: true }).data as unknown as Record<string, string>[];
    expect(rows[0]!['Box 1 - Rents']).toBe('2500.00');
    expect(rows[1]!['Box 2 - Royalties']).toBe('50.00');
  });

  it('holds back rows with errors and review verdicts', () => {
    const r = generateIris(NEC, payer, [
      rec('badtin', {}, { tin: '123' }),
      rec('nostate', {}, { state: 'XX', zip: '1' }),
      rec('biz', {}, { nameType: 'B', businessName: '' }),
      rec('rev', { category: 'unknown' }),
      rec('ok', {}),
    ]);
    expect(r.files[0]!.records).toBe(1);
    const by = Object.fromEntries(r.heldBack.map((h) => [h.payeeId, h.issues.map((i) => `${i.header} ${i.message}`)]));
    expect(by.badtin!.join()).toMatch(/9 digits/);
    expect(by.nostate!.join()).toMatch(/state/);
    expect(by.nostate!.join()).toMatch(/5 or 9 digits/);
    expect(by.biz!.join()).toMatch(/business name type/);
    expect(by.rev!.join()).toMatch(/needs review/);
  });

  it('withholding column is filled when present', () => {
    const x = rec('w', {});
    x.withheld = 600;
    const r = generateIris(NEC, payer, [x]);
    expect(r.files[0]!.csv).toContain('600.00');
  });

  it('splits into files of at most maxRecordsPerFile', () => {
    const recs = Array.from({ length: 251 }, (_, i) => rec(`p${i}`, {}));
    const r = generateIris(NEC, payer, recs);
    expect(r.files.map((f) => f.records)).toEqual([250, 1]);
    expect(r.files[0]!.name).toMatch(/part1of2/);
  });

  it('payer errors block every file', () => {
    const r = generateIris(NEC, { ...payer, tin: '000000000', nameType: 'I', lastName: '' }, [rec('a', {})]);
    expect(r.files).toEqual([]);
    expect(r.payerIssues.map((i) => i.message)).toEqual(expect.arrayContaining(['is not a valid TIN', 'is required for an individual name type']));
  });

  it('validateField covers each kind', () => {
    const v = (field: string, value: string) => validateField(NEC, field, 'h', value, 'I').map((i) => i.message);
    expect(v('payer.tinType', 'XYZ')).toEqual(['must be EIN or SSN']);
    expect(v('payer.nameType', 'Z')).toHaveLength(1);
    expect(v('recipient.firstName', 'A@B')).toHaveLength(1);
    expect(v('recipient.firstName', 'A'.repeat(41))).toHaveLength(1);
    expect(v('recipient.address1', 'A%B')).toHaveLength(1);
    expect(v('recipient.city', 'C'.repeat(41))).toHaveLength(1);
    expect(v('recipient.country', 'CA')).toHaveLength(1);
    expect(v('payer.phone', '123')).toHaveLength(1);
    expect(v('recipient.accountNumber', 'a-b')).toHaveLength(1);
    expect(v('box.nec1', '1,000')).toHaveLength(1);
    expect(v('form.taxYear', '2025')).toHaveLength(1);
    expect(v('form.date', '2026-01-31')).toEqual(['must be MM/DD/YYYY']);
    expect(v('form.date', '01/31/2026')).toEqual([]);
    expect(v('unknown.field', 'x')).toEqual([]);
    expect(v('recipient.tin', '123456789')).toEqual(['is not a valid TIN']);
  });

  it('helpers', () => {
    expect(formatDate('2027-02-01')).toBe('02/01/2027');
    expect(formatDate('bad')).toBe('bad');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(sanitize('zip', '98101-12')).toBe('98101');
    expect(sanitize('money', ' 5 ')).toBe('5');
  });

  it('templateFromHeaders maps an official header row and reports unmapped columns', () => {
    const headers = ['﻿Form Type', 'Tax Year', 'Recipient TIN', 'Recipient Last Name', 'Box 1 Nonemployee compensation', 'Some New Field'];
    const { template, unmapped } = templateFromHeaders(NEC, headers, 'iris.csv', '2026-12-10');
    expect(template.status).toBe('official');
    expect(template.columns.map((c) => c.field)).toEqual(['const:1099-NEC', 'form.taxYear', 'recipient.tin', 'recipient.lastName', 'box.nec1', 'const:']);
    expect(unmapped).toEqual(['Some New Field']);
  });
});

describe('ics', () => {
  it('builds a valid calendar with all-day events and alarms', () => {
    const ics = buildIcs(FEDERAL.deadlines, { domain: 'example.com', stamp: '20261113T000000Z' });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20270201');
    expect(ics).toContain('DTEND;VALUE=DATE:20270202');
    expect(ics).toContain('TRIGGER:-P14D');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(FEDERAL.deadlines.length);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it('fold handles long and multibyte lines', () => {
    const long = 'DESCRIPTION:' + 'é'.repeat(100);
    const folded = fold(long);
    expect(folded.split('\r\n ').join('')).toBe(long);
    expect(fold('short')).toBe('short');
  });
});

describe('w9 kit', () => {
  it('drafts an email with a mailto link and no TIN request in body', () => {
    const e = w9Email({ payeeName: 'Joe', businessName: 'Dana Design', senderName: 'Dana', email: 'joe@example.com' });
    expect(e.subject).toBe('W-9 request from Dana Design');
    expect(e.body).toContain('https://www.irs.gov/pub/irs-pdf/fw9.pdf');
    expect(e.mailto.startsWith('mailto:joe%40example.com?subject=')).toBe(true);
    const r = w9Email({ payeeName: 'Joe', businessName: 'D', senderName: 'D', reminder: true, dueBy: 'Jan 5' });
    expect(r.subject).toMatch(/^Reminder/);
    expect(r.body).toContain('Jan 5');
    expect(r.to).toBe('');
  });
  it('needsW9 + tracker', () => {
    const file = evaluatePayee({ id: 'a', name: 'a', category: 'services', isCorporation: 'no', hasTin: 'yes', payments: [{ date: '2026-01-01', amount: 3000, method: 'bank' }] }, FEDERAL);
    const small = evaluatePayee({ id: 'b', name: 'b', category: 'services', isCorporation: 'no', hasTin: 'no', payments: [{ date: '2026-01-01', amount: 100, method: 'bank' }] }, FEDERAL);
    const none = evaluatePayee({ id: 'c', name: 'c', category: 'goods', isCorporation: 'no', hasTin: 'yes', payments: [{ date: '2026-01-01', amount: 100, method: 'bank' }] }, FEDERAL);
    expect([file, small, none].map(needsW9)).toEqual([true, true, false]);
    expect(trackerSummary([{ payeeId: 'a', status: 'received' }, { payeeId: 'b', status: 'requested' }])).toEqual({ not_requested: 0, requested: 1, received: 1 });
    expect(trackerCsv([{ name: 'A, Inc', status: 'requested', amount: 5, requestedOn: '2026-12-01' }])).toBe('Payee,Email,W-9 status,Requested on,Reportable amount\r\n"A, Inc",,requested,2026-12-01,5.00\r\n');
  });
});

describe('summary model', () => {
  it('orders file > review > no_file and counts', () => {
    const mk = (id: string, amount: number, category: PayeeInput['category'] = 'services') =>
      evaluatePayee({ id, name: id, category, isCorporation: 'no', hasTin: 'yes', payments: [{ date: '2026-01-01', amount, method: 'bank' }] }, FEDERAL);
    const m = buildSummary({
      business: 'Biz',
      generatedOn: '2026-11-13',
      rulesVersion: FEDERAL.version,
      payees: [
        { name: 'small', verdict: mk('s', 100), w9: 'n/a' },
        { name: 'big', verdict: mk('b', 5000), w9: 'received' },
        { name: 'unk', verdict: mk('u', 5000, 'unknown'), w9: 'requested' },
      ],
      deadlines: FEDERAL.deadlines,
    });
    expect(m.rows.map((r) => r.name)).toEqual(['big', 'unk', 'small']);
    expect(m.counts).toEqual({ file: 1, review: 1, no_file: 1 });
    expect(m.rows[0]!.forms).toBe('1099-NEC box 1');
    expect(m.rows[2]!.forms).toBe('-');
  });
});
