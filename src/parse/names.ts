/** Payee name normalization, payment-method hints and fuzzy matching. Pure. */
import type { PayMethod, TriState, Category } from '../rules/types';

/** Bank-description prefixes that wrap the real payee name. Order matters (longest first). */
const PREFIXES: RegExp[] = [
  /^ZELLE (?:PAYMENT|PMT|TRANSFER)? ?(?:TO|SENT TO)\s+/,
  /^ONLINE (?:TRANSFER|PAYMENT|PMT) (?:TO|FOR)\s+/,
  /^(?:BILL ?PAY(?:MENT)?|BILLPAY|ONLINE BILL PAYMENT)\s+(?:TO\s+)?/,
  /^(?:ORIG CO NAME:\s*|(?:ACH|ACH DEBIT|ACH WITHDRAWAL|ELECTRONIC WITHDRAWAL|EXTERNAL WITHDRAWAL)\s+)/,
  /^(?:POS|DEBIT CARD|CHECKCARD|CHECK CARD|PURCHASE|DEBIT PURCHASE|RECURRING)\s+(?:PURCHASE\s+)?(?:\d{4}\s+)?/,
  /^(?:WIRE (?:TRANSFER )?(?:OUT|TO)|OUTGOING WIRE(?: TRANSFER)?)\s+/,
  /^(?:PAYPAL|PP)\s*\*\s*/,
  /^(?:SQ|SQU|SQUARE)\s*\*\s*/,
  /^(?:VENMO(?: PAYMENT)?|CASH APP|CASHAPP)\s*\*?\s*/,
  /^(?:TST|TOAST|STRIPE|SP|IN)\s*\*\s*/,
];

const LEGAL_SUFFIX = /\b(?:L\.?L\.?C|P\.?L\.?L\.?C|INC(?:ORPORATED)?|CORP(?:ORATION)?|CO|COMPANY|LTD|LIMITED|LLP|L\.?P|P\.?C|P\.?A|PLC)\b\.?/g;
const NOISE = /\b(?:THE|AND|OF|DBA|PMT|PAYMENT|PPD|WEB|CCD|ID|REF|CONF|CONFIRMATION|TRN|TRANSACTION|DES|INDN|CO ENTRY DESCR)\b/g;

export function cleanPayeeName(raw: string): string {
  let s = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  for (const re of PREFIXES) s = s.replace(re, '');
  // Drop trailing reference numbers, dates, card digits, and locations like "SEATTLE WA".
  s = s
    .replace(/\s+(?:CO ENTRY DESCR|ENTRY DESCR|DES|WEB ID|PPD ID|ID):.*$/, '')
    .replace(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,}\b/g, '')
    .replace(/\b(?:CHECK|CHK)\s*#?\s*\d+\b/g, '')
    .replace(/#\s*\d+/g, '')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '')
    .replace(/\b(?:X{2,}|\*{2,})\d{2,}\b/g, '')
    .replace(/\b[A-Z0-9]*\d{5,}[A-Z0-9]*\b/g, '')
    .replace(/\s+[A-Z]{2}\s*$/, (m) => (/^\s+(?:CO|PC|PA|LP)$/.test(m) ? m : ''))
    .replace(/[^A-Z0-9&' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/** Key used for exact grouping. */
export function nameKey(raw: string): string {
  return cleanPayeeName(raw)
    .replace(/'/g, '')
    .replace(LEGAL_SUFFIX, ' ')
    .replace(NOISE, ' ')
    .replace(/&/g, ' ')
    .replace(/-/g, ' ')
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaro-Winkler similarity in [0,1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array<boolean>(a.length).fill(false);
  const bm = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Similarity of two name keys, combining character and token overlap. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const minSize = Math.min(ta.size, tb.size);
  // Token containment ("JOES PLUMBING" vs "JOES PLUMBING HEATING") with at least 2 shared tokens.
  const containment = minSize >= 2 && inter === minSize ? 0.95 : 0;
  const compactA = a.replace(/ /g, '');
  const compactB = b.replace(/ /g, '');
  return Math.max(containment, jaroWinkler(compactA, compactB));
}

/** Infer payment method from a bank-statement description. */
export function methodFromDescription(desc: string): PayMethod | null {
  const s = desc.toUpperCase();
  if (/\bZELLE\b/.test(s)) return 'zelle';
  if (/\b(?:PAYPAL|PP\s*\*|VENMO|CASH ?APP|SQ\s*\*|SQUARE|STRIPE)\b/.test(s)) return 'app';
  if (/\b(?:POS|DEBIT CARD|CHECKCARD|CHECK CARD|CARD PURCHASE|VISA|MASTERCARD)\b/.test(s)) return 'card';
  if (/\b(?:CHECK|CHK)\b/.test(s)) return 'check';
  if (/\bWIRE\b/.test(s)) return 'bank';
  if (/\b(?:ACH|BILL ?PAY|ONLINE TRANSFER|ONLINE PAYMENT)\b/.test(s)) return 'ach';
  return null;
}

/** Infer payment method from a bookkeeping "payment method" / "type" column value. */
export function methodFromLabel(label: string): PayMethod | null {
  const s = label.toUpperCase();
  if (!s.trim()) return null;
  if (/CREDIT|DEBIT CARD|VISA|MASTERCARD|AMEX|AMERICAN EXPRESS|DISCOVER|\bCARD\b/.test(s)) return 'card';
  if (/PAYPAL|VENMO|CASH ?APP|SQUARE|STRIPE/.test(s)) return 'app';
  if (/ZELLE/.test(s)) return 'zelle';
  if (/CHECKING|SAVINGS/.test(s)) return 'ach';
  if (/CHECK|CHEQUE/.test(s)) return 'check';
  if (/CASH/.test(s)) return 'cash';
  if (/ACH|EFT|DIRECT DEPOSIT|BANK|TRANSFER|WIRE/.test(s)) return 'ach';
  return null;
}

/** Corporation hint from a legal suffix. LLCs are ambiguous (could elect corporate taxation). */
export function corpHint(raw: string): TriState {
  const s = raw.toUpperCase();
  if (/\b(?:INC|INCORPORATED|CORP|CORPORATION)\b\.?/.test(s)) return 'yes';
  return 'unknown';
}

/** Descriptions that are almost never 1099 payees. */
const EXCLUDE_PATTERNS: RegExp[] = [
  /\b(?:TRANSFER (?:TO|FROM) (?:SAV|CHK|CHECKING|SAVINGS)|INTERNAL TRANSFER|ONLINE TRANSFER TO (?:SAV|CHK))/,
  /\b(?:IRS|USATAXPYMT|EFTPS|FRANCHISE TAX|DEPT OF REVENUE|STATE TAX)\b/,
  /\b(?:PAYROLL|GUSTO|ADP|PAYCHEX|INTUIT PAYROLL)\b/,
  /\b(?:CREDIT CARD PAYMENT|CARD ?PAYMENT|AUTOPAY|PAYMENT THANK YOU|CAPITAL ONE|AMEX EPAYMENT|CHASE CARD|CITI CARD|DISCOVER E-PAYMENT)\b/,
  /\b(?:LOAN PAYMENT|MORTGAGE|INTEREST CHARGE|SERVICE CHARGE|MONTHLY FEE|OVERDRAFT|ATM WITHDRAWAL)\b/,
  /\bOWNER'?S? (?:DRAW|DISTRIBUTION)\b/,
];

export function categoryHint(desc: string): Category | null {
  const s = desc.toUpperCase();
  if (EXCLUDE_PATTERNS.some((re) => re.test(s))) return 'excluded';
  if (/\b(?:ATTORNEY|LAW (?:FIRM|OFFICE|GROUP)|ESQ|LEGAL)\b/.test(s)) return 'attorney_fees';
  if (/\b(?:RENT|LEASE|LANDLORD)\b/.test(s)) return 'rent';
  if (/\bROYALT/.test(s)) return 'royalties';
  if (/\b(?:AMAZON|HOME DEPOT|LOWES|STAPLES|COSTCO|WALMART|TARGET|OFFICE DEPOT|BEST BUY)\b/.test(s)) return 'goods';
  return null;
}
