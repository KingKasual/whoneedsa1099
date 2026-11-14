import { useState } from 'preact/hooks';
import type { ParsedFile } from '../parse/parse';
import type { PayMethod } from '../rules/types';

export interface LoadedFile {
  file: File;
  parsed: ParsedFile;
  method: PayMethod | '';
  flipSign: boolean;
}

interface Props {
  files: LoadedFile[];
  onAdd: (files: File[]) => void;
  onChange: (index: number, patch: Partial<Pick<LoadedFile, 'method' | 'flipSign'>>) => void;
  onRemove: (index: number) => void;
  busy: boolean;
}

export function Upload({ files, onAdd, onChange, onRemove, busy }: Props) {
  const [over, setOver] = useState(false);
  const pick = (list: FileList | null) => list && onAdd([...list]);
  return (
    <section aria-labelledby="step1">
      <h2 id="step1">1. Add your exports</h2>
      <p>
        CSV or Excel exports from your bank, credit card, PayPal, Venmo, QuickBooks, Wave or Xero. Files are read <strong>in this browser only</strong>. Nothing is uploaded.
      </p>
      <label
        class={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer?.files ?? null);
        }}
      >
        <input type="file" multiple accept=".csv,.txt,.xlsx,.xls" class="sr-only" onChange={(e) => pick((e.target as HTMLInputElement).files)} />
        <span class="drop-title">{busy ? 'Reading…' : 'Drop files here or choose files'}</span>
        <span class="muted">Payments for calendar year 2026 are used; everything else is ignored.</span>
      </label>
      {files.length === 0 && (
        <p>
          <button
            type="button"
            class="secondary"
            disabled={busy}
            onClick={async () => {
              const names = ['chase-checking.csv', 'chase-card.csv', 'paypal.csv', 'quickbooks-transaction-detail.csv', 'wave.csv'];
              const list = await Promise.all(
                names.map(async (n) => new File([await (await fetch(`./samples/${n}`)).text()], `sample-${n}`, { type: 'text/csv' })),
              );
              onAdd(list);
            }}
          >
            Try it with sample exports
          </button>{' '}
          <span class="muted small">Made-up data: a checking account, a card, PayPal, QuickBooks and Wave.</span>
        </p>
      )}
      {files.length > 0 && (
        <ul class="files">
          {files.map((f, i) => (
            <li key={f.file.name + i}>
              <div>
                <strong>{f.file.name}</strong> <span class="pill">{f.parsed.label}</span>
                <div class="muted">
                  {f.parsed.txns.length} outgoing payments · {f.parsed.inflows} incoming ignored · {f.parsed.skipped} other rows skipped
                </div>
                {f.parsed.errors.length > 0 && (
                  <details>
                    <summary>{f.parsed.errors.length} rows could not be read</summary>
                    <ul>
                      {f.parsed.errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <div class="file-opts">
                <label>
                  This file is…{' '}
                  <select value={f.method} onChange={(e) => onChange(i, { method: (e.target as HTMLSelectElement).value as PayMethod | '' })}>
                    <option value="">Auto-detect payment method</option>
                    <option value="card">A credit/debit card account</option>
                    <option value="app">A payment app (PayPal, Venmo, Square…)</option>
                    <option value="bank">A bank account (checks, ACH, Zelle)</option>
                  </select>
                </label>
                <label>
                  <input type="checkbox" checked={f.flipSign} onChange={(e) => onChange(i, { flipSign: (e.target as HTMLInputElement).checked })} /> Payments are shown as
                  positive numbers
                </label>
                <button type="button" class="link" onClick={() => onRemove(i)}>
                  Remove<span class="sr-only"> {f.file.name}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
