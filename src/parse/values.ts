/** Value parsers for dates and money found in bank / bookkeeping exports. Pure. */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function monthOf(word: string): number | undefined {
  const w = word.toLowerCase();
  return MONTHS[w] ?? MONTHS[w.slice(0, 3)];
}

const pad = (n: number): string => String(n).padStart(2, '0');

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Excel serial date (1900 system) -> ISO. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const dt = new Date(ms);
  return valid(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Parse a date cell into YYYY-MM-DD. US month-first for ambiguous slashes. */
export function parseDate(input: unknown): string | null {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : valid(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
  }
  if (typeof input === 'number') return excelSerialToIso(input);
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/.exec(s);
  if (m) {
    let y = +m[3]!;
    if (y < 100) y += 2000;
    return valid(y, +m[1]!, +m[2]!);
  }
  m = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-,]+(\d{4})$/.exec(s);
  if (m) {
    const mon = monthOf(m[2]!);
    return mon ? valid(+m[3]!, mon, +m[1]!) : null;
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) {
    const mon = monthOf(m[1]!);
    return mon ? valid(+m[3]!, mon, +m[2]!) : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));
  return null;
}

/** Parse money: "$1,234.56", "(1,234.56)", "-1234.56", "1234.56 CR". Returns null when not numeric. */
export function parseMoney(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/\s*CR$/i.test(s)) s = s.replace(/\s*CR$/i, '');
  else if (/\s*DR$/i.test(s)) {
    neg = !neg;
    s = s.replace(/\s*DR$/i, '');
  }
  s = s.replace(/[$€£\s]|USD/gi, '');
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    neg = !neg;
    s = s.slice(0, -1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  s = s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}
