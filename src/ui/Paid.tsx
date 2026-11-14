import { useState } from 'preact/hooks';
import necTpl from '../export/iris-templates/1099-NEC.ty2026.json';
import miscTpl from '../export/iris-templates/1099-MISC.ty2026.json';
import { generateIris, type IrisRecord, type IrisResult, type IrisTemplate, type Party } from '../export/iris';
import { buildIcs } from '../export/ics';
import { needsW9, trackerCsv, w9Email, type W9Status } from '../export/w9';
import { buildSummary, renderSummaryPdf } from '../export/summary';
import { FEDERAL } from '../rules';
import { CHECKOUT_PACK_URL, CHECKOUT_SINGLE_URL, DEV_UNLOCK, PAYMENTS_ENABLED, SITE_URL } from '../lib/config';
import { activateBusiness, getLicense, verifyKey, type LicenseState } from '../lib/license';
import { downloadBlob, downloadText } from '../lib/download';
import { emptyParty, money, type PayeeMeta, type Row } from './state';

const TEMPLATES = [necTpl as IrisTemplate, miscTpl as IrisTemplate];

interface Props {
  rows: Row[];
  businessId: string;
  payer: Party;
  onPayer: (p: Party) => void;
  meta: Record<string, PayeeMeta>;
  onMeta: (key: string, m: PayeeMeta) => void;
}

function PartyFields({ prefix, value, onChange, legend }: { prefix: string; value: Party; onChange: (p: Party) => void; legend: string }) {
  const f = (k: keyof Party, label: string, opts: { autoComplete?: string; inputMode?: 'numeric'; width?: string } = {}) => (
    <label class={opts.width ?? ''}>
      {label}
      <input
        value={(value[k] as string | undefined) ?? ''}
        autoComplete={opts.autoComplete ?? 'off'}
        inputMode={opts.inputMode}
        onInput={(e) => onChange({ ...value, [k]: (e.target as HTMLInputElement).value })}
        id={`${prefix}-${k}`}
      />
    </label>
  );
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div class="grid">
        <label>
          Name type
          <select value={value.nameType} onChange={(e) => onChange({ ...value, nameType: (e.target as HTMLSelectElement).value as 'B' | 'I' })}>
            <option value="I">Individual / sole proprietor</option>
            <option value="B">Business</option>
          </select>
        </label>
        {value.nameType === 'B' ? f('businessName', 'Business name (line 1 of W-9)') : (
          <>
            {f('firstName', 'First name')}
            {f('lastName', 'Last name')}
          </>
        )}
        <label>
          TIN type
          <select value={value.tinType} onChange={(e) => onChange({ ...value, tinType: (e.target as HTMLSelectElement).value as Party['tinType'] })}>
            <option value="">Choose</option>
            <option value="SSN">SSN / ITIN</option>
            <option value="EIN">EIN</option>
          </select>
        </label>
        {f('tin', 'TIN (9 digits)', { inputMode: 'numeric' })}
        {f('address1', 'Street address')}
        {f('city', 'City')}
        {f('state', 'State (2 letters)', { width: 'narrow' })}
        {f('zip', 'ZIP', { inputMode: 'numeric', width: 'narrow' })}
      </div>
    </fieldset>
  );
}

export function Paid({ rows, businessId, payer, onPayer, meta, onMeta }: Props) {
  const [license, setLicense] = useState<LicenseState | null>(() => getLicense());
  const [keyInput, setKeyInput] = useState('');
  const [msg, setMsg] = useState('');
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [results, setResults] = useState<IrisResult[]>([]);
  const [senderName, setSenderName] = useState('');

  const unlocked = devUnlocked || (license !== null && Boolean(license.activations[businessId]));
  const candidates = rows.filter((r) => needsW9(r.verdict));
  const metaFor = (key: string, row: Row): PayeeMeta =>
    meta[key] ?? { w9: row.tags.hasTin === 'yes' ? 'received' : 'not_requested', recipient: emptyParty(row.tags.isCorporation === 'yes' ? 'B' : 'I') };

  async function unlock(e: Event) {
    e.preventDefault();
    setMsg('Checking…');
    try {
      let st = license?.key === keyInput.trim() ? license : await verifyKey(keyInput.trim());
      st = await activateBusiness(st, businessId);
      setLicense(st);
      setMsg(`Unlocked (${st.plan === 'pack' ? 'Bookkeeper pack' : 'Single business'}).`);
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  if (!unlocked) {
    return (
      <section aria-labelledby="paid" class="paid">
        <h2 id="paid">4. File for free with IRIS ($19)</h2>
        <ul>
          <li>IRIS-ready CSV files for 1099-NEC and 1099-MISC, checked against IRIS format rules and split into files of 250 or fewer</li>
          <li>W-9 request emails and a missing-W-9 tracker</li>
          <li>A one-page PDF summary for your accountant</li>
          <li>Deadline reminders for your calendar (.ics)</li>
        </ul>
        <p>$19 per business, or $59 for bookkeepers (up to 15 businesses). No account needed: you get a license key by email.</p>
        {PAYMENTS_ENABLED ? (
          <>
            <p class="cta-row">
              {CHECKOUT_SINGLE_URL && <a class="button" href={CHECKOUT_SINGLE_URL}>Buy for one business: $19</a>}
              {CHECKOUT_PACK_URL && <a class="button secondary" href={CHECKOUT_PACK_URL}>Bookkeeper pack: $59</a>}
            </p>
            <form onSubmit={unlock} class="inline">
              <label>
                License key <input value={keyInput} onInput={(e) => setKeyInput((e.target as HTMLInputElement).value)} autoComplete="off" required />
              </label>
              <button type="submit">Unlock</button>
            </form>
            <p role="status">{msg}</p>
          </>
        ) : (
          <p class="muted">Paid exports open on December 1.</p>
        )}
        {DEV_UNLOCK && (
          <button type="button" class="link" onClick={() => setDevUnlocked(true)}>
            Test mode: unlock paid features (no payment)
          </button>
        )}
      </section>
    );
  }

  const records: IrisRecord[] = rows
    .filter((r) => r.verdict.forms.length > 0)
    .map((r) => ({ payeeId: r.group.id, displayName: r.group.displayName, verdict: r.verdict, recipient: metaFor(r.group.key, r).recipient }));

  const runIris = () => setResults(TEMPLATES.map((t) => generateIris(t, payer, records, 'whoneedsa1099')));
  const placeholder = TEMPLATES.some((t) => t.status !== 'official');
  const businessName = payer.nameType === 'B' ? payer.businessName : `${payer.firstName} ${payer.lastName}`.trim();

  return (
    <section aria-labelledby="paid" class="paid">
      <h2 id="paid">4. Prepare your filing</h2>

      <h3>W-9 tracker</h3>
      <p>
        {candidates.length} payees need a W-9. TINs you type below stay in this browser tab and are never saved or sent anywhere; they're only used to build your IRIS file.
      </p>
      <label>
        Your name for emails <input value={senderName} onInput={(e) => setSenderName((e.target as HTMLInputElement).value)} />
      </label>
      <ul class="w9-list">
        {candidates.map((r) => {
          const m = metaFor(r.group.key, r);
          const draft = w9Email({ payeeName: r.group.displayName, businessName: businessName || 'my business', senderName: senderName || 'Me', ...(m.email ? { email: m.email } : {}), reminder: m.w9 === 'requested' });
          return (
            <li key={r.group.key}>
              <details>
                <summary>
                  <strong>{r.group.displayName}</strong> · {money(r.verdict.forms.reduce((s, f) => s + f.amount, 0) || r.verdict.totalPaid)} ·{' '}
                  <span class={`badge w9-${m.w9}`}>{m.w9.replace('_', ' ')}</span>
                </summary>
                <div class="grid">
                  <label>
                    W-9 status
                    <select value={m.w9} onChange={(e) => onMeta(r.group.key, { ...m, w9: (e.target as HTMLSelectElement).value as W9Status, ...((e.target as HTMLSelectElement).value === 'requested' ? { requestedOn: new Date().toISOString().slice(0, 10) } : {}) })}>
                      <option value="not_requested">Not requested</option>
                      <option value="requested">Requested</option>
                      <option value="received">Received</option>
                    </select>
                  </label>
                  <label>
                    Email
                    <input type="email" value={m.email ?? ''} onInput={(e) => onMeta(r.group.key, { ...m, email: (e.target as HTMLInputElement).value })} />
                  </label>
                  <a class="button secondary" href={draft.mailto}>
                    {m.w9 === 'requested' ? 'Send reminder' : 'Email W-9 request'}
                  </a>
                </div>
                {r.verdict.forms.length > 0 && (
                  <PartyFields prefix={`r-${r.group.id}`} legend="Details from their W-9 (for the IRIS file)" value={m.recipient} onChange={(p) => onMeta(r.group.key, { ...m, recipient: p })} />
                )}
              </details>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        class="secondary"
        onClick={() =>
          downloadText(
            'w9-tracker.csv',
            trackerCsv(
              candidates.map((r) => {
                const m = metaFor(r.group.key, r);
                return { name: r.group.displayName, status: m.w9, ...(m.requestedOn ? { requestedOn: m.requestedOn } : {}), ...(m.email ? { email: m.email } : {}), amount: r.verdict.forms.reduce((s, f) => s + f.amount, 0) };
              }),
            ),
          )
        }
      >
        Download W-9 tracker (CSV)
      </button>

      <h3>IRIS CSV files</h3>
      <PartyFields prefix="payer" legend="Your business (the payer)" value={payer} onChange={onPayer} />
      {placeholder && (
        <p class="warn-critical" role="alert">
          The official IRIS CSV templates for tax year 2026 haven't been loaded into this build yet. Files generated now use provisional headers and may be rejected by IRIS.
        </p>
      )}
      <button type="button" onClick={runIris}>
        Build IRIS files
      </button>
      {results.map((res) => (
        <div key={res.form} class="iris-result">
          <h4>{res.form}</h4>
          {res.payerIssues.length > 0 && (
            <ul class="warnings">
              {res.payerIssues.map((i, k) => (
                <li key={k} class="warn-critical">
                  Your business: {i.header} {i.message}
                </li>
              ))}
            </ul>
          )}
          {res.files.map((f) => (
            <button type="button" key={f.name} onClick={() => downloadText(f.name, f.csv)}>
              Download {f.name} ({f.records} records)
            </button>
          ))}
          {res.files.map((f) => (
            <details key={`${f.name}-preview`}>
              <summary>Preview {f.name}</summary>
              <pre class="csv-preview" tabIndex={0}>{f.csv}</pre>
            </details>
          ))}
          {res.files.length === 0 && res.payerIssues.length === 0 && <p class="muted">No payees need this form.</p>}
          {res.heldBack.length > 0 && (
            <>
              <p>
                <strong>{res.heldBack.length} payees held back</strong> until these are fixed:
              </p>
              <ul class="warnings">
                {res.heldBack.map((h) => (
                  <li key={h.payeeId} class="warn-warn">
                    <strong>{h.displayName}:</strong> {h.issues.map((i) => `${i.header} ${i.message}`).join('; ')}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
      <p class="muted">
        Upload these at the IRS IRIS Taxpayer Portal (free). You still need to send each payee their copy by Feb 1, 2027.
      </p>

      <h3>Accountant summary & deadlines</h3>
      <p class="cta-row">
        <button
          type="button"
          class="secondary"
          onClick={async () => {
            const model = buildSummary({
              business: businessName || 'My business',
              generatedOn: new Date().toISOString().slice(0, 10),
              rulesVersion: FEDERAL.version,
              payees: rows.map((r) => ({ name: r.group.displayName, verdict: r.verdict, w9: metaFor(r.group.key, r).w9.replace('_', ' ') })),
              deadlines: FEDERAL.deadlines,
            });
            downloadBlob('1099-summary-2026.pdf', await renderSummaryPdf(model));
          }}
        >
          Download PDF summary
        </button>
        <button
          type="button"
          class="secondary"
          onClick={() =>
            downloadText(
              '1099-deadlines-2027.ics',
              buildIcs(FEDERAL.deadlines, { domain: new URL(SITE_URL).hostname, stamp: new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z') }),
              'text/calendar;charset=utf-8',
            )
          }
        >
          Add deadlines to calendar (.ics)
        </button>
      </p>
    </section>
  );
}
