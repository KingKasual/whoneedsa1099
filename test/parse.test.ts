import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { utils, write } from 'xlsx';
import { parseContent } from '../src/parse/read';
import { parseRows } from '../src/parse/parse';
import { groupPayees } from '../src/parse/group';
import { parseDate, parseMoney, excelSerialToIso } from '../src/parse/values';
import { cleanPayeeName, nameKey, similarity, jaroWinkler, methodFromDescription, methodFromLabel, corpHint, categoryHint } from '../src/parse/names';
import { detectFormat } from '../src/parse/formats';

const fx = (name: string): string => readFileSync(join(__dirname, 'fixtures/exports', name), 'utf8');

describe('format fixtures', () => {
  it('Chase checking: Zelle counted, Venmo flagged app, transfers/taxes hinted excluded, inflows dropped', () => {
    const f = parseContent('chase-checking.csv', fx('chase-checking.csv'));
    expect(f.format).toBe('bank_generic');
    expect(f.inflows).toBe(1);
    const byDesc = (s: string) => f.txns.find((t) => t.description.includes(s))!;
    expect(byDesc('JOES PLUMBING LLC JPM99').method).toBe('zelle');
    expect(byDesc('VENMO').method).toBe('app');
    expect(byDesc('CHECK 1043').method).toBe('check');
    expect(byDesc('ONLINE TRANSFER').categoryHint).toBe('excluded');
    expect(byDesc('IRS').categoryHint).toBe('excluded');
    expect(byDesc('SMITH LAW').categoryHint).toBe('attorney_fees');
    expect(byDesc('JOES PLUMBING LLC JPM00000').date).toBe('2025-12-28');
    expect(f.txns.every((t) => t.amount > 0)).toBe(true);
  });

  it('Chase card: card method, payments skipped', () => {
    const f = parseContent('chase-card.csv', fx('chase-card.csv'));
    expect(f.format).toBe('chase_card');
    expect(f.txns).toHaveLength(2);
    expect(f.txns.every((t) => t.method === 'card')).toBe(true);
    expect(f.txns.find((t) => t.rawName.includes('HOME DEPOT'))?.categoryHint).toBe('goods');
  });

  it('Amex: positive charges are outflows', () => {
    const f = parseContent('amex.csv', fx('amex.csv'));
    expect(f.format).toBe('amex');
    expect(f.txns).toHaveLength(1);
    expect(f.txns[0]).toMatchObject({ amount: 850, method: 'card' });
  });

  it('PayPal: completed payments only, app method', () => {
    const f = parseContent('paypal.csv', fx('paypal.csv'));
    expect(f.format).toBe('paypal');
    expect(f.txns.map((t) => t.amount)).toEqual([1800, 900]);
    expect(f.txns.every((t) => t.method === 'app')).toBe(true);
  });

  it('Venmo: outgoing only, payee from To', () => {
    const f = parseContent('venmo.csv', fx('venmo.csv'));
    expect(f.format).toBe('venmo');
    expect(f.txns).toHaveLength(1);
    expect(f.txns[0]).toMatchObject({ rawName: 'Sam Windows', amount: 400, method: 'app', date: '2026-04-02' });
  });

  it('QuickBooks: title rows skipped, payments only (no bills, deposits, totals)', () => {
    const f = parseContent('qbo.csv', fx('quickbooks-transaction-detail.csv'));
    expect(f.format).toBe('quickbooks');
    expect(f.txns.map((t) => [t.rawName, t.amount, t.method])).toEqual([
      ['Ridgeline Electric Inc.', 2600, 'check'],
      ['Bright Bookkeeping', 750, 'unknown'],
      ['Bright Bookkeeping LLC', 750, 'unknown'],
      ['Bright Bookkeeping', 750, 'card'],
    ]);
  });

  it('Wave: expense lines only, vendor as payee, card account detected', () => {
    const f = parseContent('wave.csv', fx('wave.csv'));
    expect(f.format).toBe('wave');
    expect(f.txns.map((t) => [t.rawName, t.amount, t.method])).toEqual([
      ['Tom Rivera', 2200, 'ach'],
      ['Oak Street Properties', 1500, 'card'],
    ]);
  });

  it('Xero bank statement', () => {
    const f = parseContent('xero-bank.csv', fx('xero-bank.csv'));
    expect(f.format).toBe('xero_bank');
    expect(f.txns.map((t) => t.amount)).toEqual([2050, 500]);
  });

  it('Xero account transactions report with "13 Nov 2026" dates', () => {
    const f = parseContent('xero-report.csv', fx('xero-report.csv'));
    expect(f.format).toBe('xero_report');
    expect(f.txns).toHaveLength(1);
    expect(f.txns[0]).toMatchObject({ date: '2026-11-13', amount: 125, categoryHint: 'royalties' });
  });

  it('XLSX with Excel serial dates parses like CSV', () => {
    const ws = utils.aoa_to_sheet([
      ['Date', 'Description', 'Amount'],
      [46100, 'ZELLE PAYMENT TO ANNA CLEANING', -2100],
      ['01/05/2026', 'CHECK 2001', '-$300.00'],
    ]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const f = parseContent('bank.xlsx', buf);
    expect(f.format).toBe('bank_generic');
    expect(f.txns.map((t) => [t.date, t.amount, t.method])).toEqual([
      ['2026-03-19', 2100, 'zelle'],
      ['2026-01-05', 300, 'check'],
    ]);
  });

  it('bytes for a CSV are decoded', () => {
    const f = parseContent('x.csv', new TextEncoder().encode(fx('xero-bank.csv')));
    expect(f.txns).toHaveLength(2);
  });

  it('options: flipSign and forced method', () => {
    const rows = [['Date', 'Description', 'Amount'], ['2026-01-01', 'ACME', '500']];
    expect(parseRows('a', rows).txns).toHaveLength(0);
    const f = parseRows('a', rows, { flipSign: true, method: 'card' });
    expect(f.txns[0]).toMatchObject({ amount: 500, method: 'card' });
  });

  it('debit/credit columns', () => {
    const rows = [
      ['Date', 'Description', 'Debit', 'Credit'],
      ['2026-01-01', 'ACH PAYMENT ACME', '500.00', ''],
      ['2026-01-02', 'DEPOSIT', '', '900.00'],
      ['2026-01-03', '', '10', ''],
      ['2026-01-04', 'BAD', 'abc', ''],
    ];
    const f = parseRows('dc', rows);
    expect(f.txns).toHaveLength(1);
    expect(f.txns[0]?.method).toBe('ach');
    expect(f.inflows).toBe(1);
    expect(f.errors).toHaveLength(2);
  });

  it('unrecognized file reports an error', () => {
    const f = parseRows('junk', [['a', 'b'], ['c', 'd']]);
    expect(f.label).toBe('Unrecognized');
    expect(f.errors[0]).toMatch(/header/);
  });
});

describe('values', () => {
  it.each([
    ['2026-03-04', '2026-03-04'],
    ['2026-03-04T10:00:00', '2026-03-04'],
    ['3/4/2026', '2026-03-04'],
    ['03-04-26', '2026-03-04'],
    ['4 Mar 2026', '2026-03-04'],
    ['04-Mar-2026', '2026-03-04'],
    ['Mar 4, 2026', '2026-03-04'],
    ['March 4 2026', '2026-03-04'],
    ['46085', '2026-03-04'],
    ['2/30/2026', null],
    ['13/01/2026', null],
    ['4 Foo 2026', null],
    ['Foo 4, 2026', null],
    ['', null],
    ['hello', null],
  ])('parseDate(%s)', (input, out) => expect(parseDate(input)).toBe(out));

  it('parseDate other types', () => {
    expect(parseDate(new Date(Date.UTC(2026, 0, 2)))).toBe('2026-01-02');
    expect(parseDate(new Date('x'))).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(excelSerialToIso(-1)).toBeNull();
  });

  it.each([
    ['$1,234.56', 1234.56],
    ['(1,234.56)', -1234.56],
    ['-50', -50],
    ['50-', -50],
    ['+50', 50],
    ['- $25.00', -25],
    ['100.00 CR', 100],
    ['100.00 DR', -100],
    ['USD 12', 12],
    ['.5', 0.5],
    ['', null],
    ['abc', null],
  ])('parseMoney(%s)', (input, out) => expect(parseMoney(input)).toBe(out));

  it('parseMoney numbers', () => {
    expect(parseMoney(5)).toBe(5);
    expect(parseMoney(Number.NaN)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });
});

describe('names and fuzzy grouping', () => {
  it('cleans bank wrappers', () => {
    expect(cleanPayeeName('ZELLE PAYMENT TO JOES PLUMBING LLC JPM99A1B2C3')).toBe('JOES PLUMBING LLC');
    expect(cleanPayeeName('SQ *GREEN THUMB LANDSCAPING')).toBe('GREEN THUMB LANDSCAPING');
    expect(cleanPayeeName('ORIG CO NAME:SMITH LAW GROUP PC')).toBe('SMITH LAW GROUP PC');
    expect(cleanPayeeName('POS PURCHASE 1234 ACME HARDWARE SEATTLE WA')).toBe('ACME HARDWARE SEATTLE');
  });

  it('keys ignore legal suffixes and punctuation', () => {
    expect(nameKey("Joe's Plumbing LLC")).toBe(nameKey('JOES PLUMBING'));
    expect(nameKey('Smith & Sons, Inc.')).toBe(nameKey('SMITH SONS'));
  });

  it('similarity', () => {
    expect(similarity('JOES PLUMBING', 'JOES PLUMBING')).toBe(1);
    expect(similarity('JOES PLUMBING', 'JOES PLUMBING HEATING')).toBeGreaterThanOrEqual(0.93);
    expect(similarity('JOES PLUMBING', 'JOSE PAINTING')).toBeLessThan(0.93);
    expect(jaroWinkler('', 'A')).toBe(0);
    expect(jaroWinkler('ABC', 'XYZ')).toBe(0);
  });

  it('method + corp + category hints', () => {
    expect(methodFromDescription('WIRE OUT ACME')).toBe('bank');
    expect(methodFromDescription('SOMETHING')).toBeNull();
    expect(methodFromLabel('')).toBeNull();
    expect(methodFromLabel('PayPal')).toBe('app');
    expect(methodFromLabel('Zelle')).toBe('zelle');
    expect(methodFromLabel('Cash')).toBe('cash');
    expect(methodFromLabel('Wire')).toBe('ach');
    expect(methodFromLabel('Other')).toBeNull();
    expect(corpHint('Ridgeline Electric Inc.')).toBe('yes');
    expect(corpHint('Bright LLC')).toBe('unknown');
    expect(categoryHint('OFFICE LEASE')).toBe('rent');
    expect(categoryHint('GUSTO PAYROLL')).toBe('excluded');
    expect(categoryHint('random')).toBeNull();
  });

  it('groups the Chase + QuickBooks fixtures with fuzzy merging', () => {
    const txns = [
      ...parseContent('chase-checking.csv', fx('chase-checking.csv')).txns,
      ...parseContent('qbo.csv', fx('quickbooks-transaction-detail.csv')).txns,
    ];
    const groups = groupPayees(txns);
    const joes = groups.find((g) => g.key.startsWith('JOES PLUMBING'))!;
    expect(joes.txns).toHaveLength(3);
    expect(joes.total).toBe(2850);
    const bright = groups.find((g) => g.key === 'BRIGHT BOOKKEEPING')!;
    expect(bright.txns).toHaveLength(3);
    expect(bright.displayName).toBe('Bright Bookkeeping');
    const ridge = groups.find((g) => g.key.startsWith('RIDGELINE'))!;
    expect(ridge.suggestedCorp).toBe('yes');
    expect(groups.find((g) => g.key.startsWith('SMITH LAW'))?.suggestedCategory).toBe('attorney_fees');
  });

  it('detectFormat returns null for non-matching headers', () => {
    expect(detectFormat(['foo', 'bar'])).toBeNull();
  });
});

describe('unnamed rows', () => {
  it('never merges rows that have no payee name', () => {
    const txns = parseContent('chase-checking.csv', fx('chase-checking.csv')).txns;
    const groups = groupPayees(txns);
    const unnamed = groups.filter((g) => g.displayName.includes('payee name not in export'));
    expect(unnamed.length).toBeGreaterThanOrEqual(2);
    expect(unnamed.every((g) => g.txns.length === 1)).toBe(true);
  });
});
