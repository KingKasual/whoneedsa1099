import type { Category, TriState } from '../rules/types';
import { CATEGORY_LABEL, money, type Row, type Tags } from './state';

interface Props {
  rows: Row[];
  onTag: (key: string, patch: Partial<Tags>) => void;
  onMerge: (fromKey: string, intoKey: string) => void;
  payerState: string;
  onPayerState: (s: string) => void;
  states: { code: string; name: string }[];
}

const METHOD_LABEL: Record<string, string> = { card: 'card', app: 'app', zelle: 'Zelle', check: 'check', ach: 'ACH', bank: 'bank', cash: 'cash', unknown: '?' };

export function Payees({ rows, onTag, onMerge, payerState, onPayerState, states }: Props) {
  const sorted = [...rows].sort((a, b) => b.group.total - a.group.total);
  return (
    <section aria-labelledby="step2">
      <h2 id="step2">2. Tag your payees</h2>
      <p>
        We grouped {rows.length} payees. Tell us what each was paid for. Card and payment-app payments are flagged automatically, since they're reported on Form 1099-K instead.
      </p>
      <label class="inline">
        Your business's state (for state 1099 rules):{' '}
        <select value={payerState} onChange={(e) => onPayerState((e.target as HTMLSelectElement).value)}>
          <option value="">Choose a state</option>
          {states.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div class="table-wrap">
        <table>
          <caption class="sr-only">Payees and tags</caption>
          <thead>
            <tr>
              <th scope="col">Payee</th>
              <th scope="col" class="num">
                Paid in 2026
              </th>
              <th scope="col">Paid by</th>
              <th scope="col">What for</th>
              <th scope="col">
                Corporation?<div class="muted small">LLCs: check their W-9</div>
              </th>
              <th scope="col">Have their W-9 / TIN?</th>
              <th scope="col">Same as…</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ group: g, tags }) => {
              const methods = [...new Set(g.txns.map((t) => METHOD_LABEL[t.method] ?? t.method))].join(', ');
              const id = `p-${g.id}`;
              return (
                <tr key={g.key}>
                  <th scope="row" id={id}>
                    {g.displayName}
                    {g.aliases.length > 1 && <div class="muted small">{g.aliases.length} name variants merged</div>}
                  </th>
                  <td class="num">{money(g.total)}</td>
                  <td>
                    {methods}
                    <div class="muted small">{g.txns.length} payments</div>
                  </td>
                  <td>
                    <select aria-label={`${g.displayName}: what for?`} value={tags.category} onChange={(e) => onTag(g.key, { category: (e.target as HTMLSelectElement).value as Category })}>
                      {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`${g.displayName}: corporation?`} value={tags.isCorporation} onChange={(e) => onTag(g.key, { isCorporation: (e.target as HTMLSelectElement).value as TriState })}>
                      <option value="unknown">Don't know</option>
                      <option value="no">No</option>
                      <option value="yes">Yes (C/S corp)</option>
                    </select>
                  </td>
                  <td>
                    <select aria-label={`${g.displayName}: have W-9?`} value={tags.hasTin} onChange={(e) => onTag(g.key, { hasTin: (e.target as HTMLSelectElement).value as TriState })}>
                      <option value="unknown">Not sure</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </td>
                  <td>
                    <select aria-label={`Merge ${g.displayName} into another payee`} value="" onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      if (v) onMerge(g.key, v);
                    }}>
                      <option value="">—</option>
                      {sorted
                        .filter((o) => o.group.key !== g.key)
                        .map((o) => (
                          <option key={o.group.key} value={o.group.key}>
                            {o.group.displayName}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
