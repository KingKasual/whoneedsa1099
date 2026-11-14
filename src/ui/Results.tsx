import { summarize } from '../rules';
import { money, STATUS_LABEL, type Row } from './state';

export function Results({ rows }: { rows: Row[] }) {
  const s = summarize(rows.map((r) => r.verdict));
  const order = { file: 0, review: 1, no_file: 2 } as const;
  const sorted = [...rows].sort((a, b) => order[a.verdict.status] - order[b.verdict.status] || b.group.total - a.group.total);
  return (
    <section aria-labelledby="step3">
      <h2 id="step3">3. Who gets a 1099</h2>
      <p class="summary" role="status">
        <span class="badge file">{s.file} need a 1099</span> <span class="badge review">{s.review} need review</span> <span class="badge no_file">{s.no_file} don't</span>
      </p>
      <ul class="verdicts">
        {sorted.map(({ group, verdict: v }) => (
          <li key={group.key} class={`verdict ${v.status}`}>
            <div class="verdict-head">
              <h3>{group.displayName}</h3>
              <span class={`badge ${v.status}`}>{STATUS_LABEL[v.status]}</span>
            </div>
            <p>
              {v.forms.length > 0 ? v.forms.map((f) => `${f.form} box ${f.box}: ${money(f.amount)}`).join(' · ') : `Paid ${money(v.totalPaid)} in 2026`}
              {v.excludedAmount > 0 && <span class="muted"> · {money(v.excludedAmount)} excluded</span>}
            </p>
            {v.warnings.length > 0 && (
              <ul class="warnings">
                {v.warnings.map((w, i) => (
                  <li key={i} class={`warn-${w.severity}`}>
                    <strong>{w.title}.</strong> {w.text}{' '}
                    <a href={w.source} target="_blank" rel="noopener noreferrer">
                      Source<span class="sr-only"> for {w.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary>Why? ({v.reasons.length} rules applied)</summary>
              <ul class="reasons">
                {v.reasons.map((r, i) => (
                  <li key={i}>
                    <strong>{r.title}</strong>
                    {r.amount !== undefined && <> ({money(r.amount)})</>}: {r.text}{' '}
                    <a href={r.source} target="_blank" rel="noopener noreferrer">
                      Source<span class="sr-only"> for {r.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <p class="disclaimer">
        Results are based on federal rules for tax year 2026 and the answers you gave. This is not tax or legal advice. <a href="/disclaimer/">Read the full disclaimer</a>.
      </p>
    </section>
  );
}
