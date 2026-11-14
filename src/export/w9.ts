/** W-9 request email kit + tracker helpers. Pure. Nothing here is sent anywhere by the app. */
import type { Verdict } from '../rules/types';

export type W9Status = 'not_requested' | 'requested' | 'received';

export interface W9Entry {
  payeeId: string;
  status: W9Status;
  requestedOn?: string;
  email?: string;
}

export const W9_FORM_URL = 'https://www.irs.gov/pub/irs-pdf/fw9.pdf';

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  mailto: string;
}

export function w9Email(opts: { payeeName: string; businessName: string; senderName: string; email?: string; dueBy?: string; reminder?: boolean }): EmailDraft {
  const due = opts.dueBy ?? 'January 8';
  const subject = opts.reminder ? `Reminder: W-9 needed for ${opts.businessName}` : `W-9 request from ${opts.businessName}`;
  const body = [
    `Hi ${opts.payeeName},`,
    '',
    opts.reminder
      ? `Quick reminder: I still need a completed Form W-9 from you so I can prepare year-end tax forms.`
      : `Thanks for your work this year. To prepare year-end tax forms (Form 1099), I need a completed Form W-9 from you.`,
    '',
    `You can download the official form here: ${W9_FORM_URL}`,
    '',
    `Please fill it out, sign it, and send it back by ${due}. For your security, please don't email your SSN or EIN in the body of an email: a signed PDF via a secure method (or a phone call) is better.`,
    '',
    'Thank you!',
    opts.senderName,
    opts.businessName,
  ].join('\n');
  const to = opts.email ?? '';
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { to, subject, body, mailto };
}

/** Payees that need a W-9: anyone not definitely "no_file" with money that counts toward a 1099. */
export function needsW9(v: Verdict): boolean {
  return v.status === 'file' || v.status === 'review' || v.warnings.some((w) => w.ruleId === 'COLLECT_W9' || w.ruleId === 'BACKUP_WITHHOLDING');
}

export function trackerSummary(entries: W9Entry[]): Record<W9Status, number> {
  const out: Record<W9Status, number> = { not_requested: 0, requested: 0, received: 0 };
  for (const e of entries) out[e.status] += 1;
  return out;
}

export function trackerCsv(rows: { name: string; status: W9Status; requestedOn?: string; email?: string; amount: number }[]): string {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [['Payee', 'Email', 'W-9 status', 'Requested on', 'Reportable amount'].join(',')];
  for (const r of rows) lines.push([esc(r.name), esc(r.email ?? ''), r.status, r.requestedOn ?? '', r.amount.toFixed(2)].join(','));
  return lines.join('\r\n') + '\r\n';
}
