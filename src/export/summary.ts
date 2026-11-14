/** Accountant summary: pure data model + a PDF renderer (jsPDF, lazy-loaded in the browser). */
import type { Verdict } from '../rules/types';

export interface SummaryRow {
  name: string;
  status: Verdict['status'];
  forms: string;
  amount: number;
  w9: string;
  note: string;
}

export interface SummaryModel {
  title: string;
  business: string;
  generatedOn: string;
  rulesVersion: string;
  counts: { file: number; review: number; no_file: number };
  rows: SummaryRow[];
  deadlines: { date: string; label: string }[];
  disclaimer: string;
}

export const DISCLAIMER =
  'Prepared with WhoNeedsA1099 from the user\'s own exports and answers. This is not tax or legal advice. Verify each result with a tax professional and current IRS instructions.';

export function buildSummary(input: {
  business: string;
  generatedOn: string;
  rulesVersion: string;
  payees: { name: string; verdict: Verdict; w9: string }[];
  deadlines: { date: string; label: string }[];
}): SummaryModel {
  const order = { file: 0, review: 1, no_file: 2 } as const;
  const rows = input.payees
    .map(({ name, verdict, w9 }) => ({
      name,
      status: verdict.status,
      forms: verdict.forms.map((f) => `${f.form} box ${f.box}`).join('; ') || '-',
      amount: verdict.forms.reduce((s, f) => s + f.amount, 0) || verdict.totalPaid,
      w9,
      note: verdict.warnings[0]?.title ?? verdict.reasons[0]?.title ?? '',
    }))
    .sort((a, b) => order[a.status] - order[b.status] || b.amount - a.amount);
  const counts = { file: 0, review: 0, no_file: 0 };
  for (const r of rows) counts[r.status] += 1;
  return {
    title: `1099 summary, tax year 2026`,
    business: input.business,
    generatedOn: input.generatedOn,
    rulesVersion: input.rulesVersion,
    counts,
    rows,
    deadlines: input.deadlines,
    disclaimer: DISCLAIMER,
  };
}

const STATUS_LABEL = { file: 'File', review: 'Review', no_file: 'No form' } as const;

/** Renders to a one-page PDF. Rows beyond the page are summarized, keeping it to one page. */
export async function renderSummaryPdf(m: SummaryModel): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  let y = 48;
  doc.setFont('helvetica', 'bold').setFontSize(16).text(m.title, 40, y);
  y += 18;
  doc.setFont('helvetica', 'normal').setFontSize(10).text(`${m.business}  |  generated ${m.generatedOn}  |  rules v${m.rulesVersion}`, 40, y);
  y += 16;
  doc.text(`Needs a 1099: ${m.counts.file}    Needs review: ${m.counts.review}    No form: ${m.counts.no_file}`, 40, y);
  y += 22;
  const cols = [40, 230, 290, 410, 480];
  doc.setFont('helvetica', 'bold');
  ['Payee', 'Result', 'Form / box', 'Amount', 'W-9'].forEach((h, i) => doc.text(h, cols[i]!, y));
  doc.setFont('helvetica', 'normal');
  y += 4;
  doc.line(40, y, W - 40, y);
  y += 12;
  const maxY = 620;
  let shown = 0;
  for (const r of m.rows) {
    if (y > maxY) break;
    doc.text(r.name.slice(0, 34), cols[0]!, y);
    doc.text(STATUS_LABEL[r.status], cols[1]!, y);
    doc.text(r.forms.slice(0, 22), cols[2]!, y);
    doc.text(`$${r.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, cols[3]!, y);
    doc.text(r.w9, cols[4]!, y);
    y += 14;
    shown++;
  }
  if (shown < m.rows.length) {
    doc.setFont('helvetica', 'italic').text(`+ ${m.rows.length - shown} more payees (see the app's CSV export)`, 40, y);
    doc.setFont('helvetica', 'normal');
    y += 14;
  }
  y = Math.max(y + 10, 650);
  doc.setFont('helvetica', 'bold').text('Deadlines', 40, y);
  doc.setFont('helvetica', 'normal');
  for (const d of m.deadlines.slice(0, 4)) {
    y += 13;
    doc.text(`${d.date}  ${d.label}`, 40, y);
  }
  doc.setFontSize(8).text(doc.splitTextToSize(m.disclaimer, W - 80) as string[], 40, 752);
  return doc.output('blob');
}
