import { useMemo, useState } from 'preact/hooks';
import { groupPayees, type PayeeGroup } from '../parse/group';
import { STATES } from '../rules';
import { load, save, remove } from '../lib/storage';
import { randomLabel } from '../lib/license';
import { Upload, type LoadedFile } from './Upload';
import { Payees } from './Payees';
import { Results } from './Results';
import { Paid } from './Paid';
import { buildRows, emptyParty, type PayeeMeta, type Tags } from './state';
import type { Party } from '../export/iris';

const PREFS = 'wg1099.prefs';

interface Prefs {
  remember: boolean;
  payerState: string;
  businessId: string;
  tags: Record<string, Tags>;
  merges: Record<string, string>;
}

function mergeGroups(groups: PayeeGroup[], merges: Record<string, string>): PayeeGroup[] {
  const byKey = new Map(groups.map((g) => [g.key, { ...g, txns: [...g.txns], aliases: [...g.aliases] }]));
  const resolve = (k: string, seen = new Set<string>()): string => {
    const t = merges[k];
    if (!t || seen.has(k) || !byKey.has(t)) return k;
    seen.add(k);
    return resolve(t, seen);
  };
  for (const g of groups) {
    const target = resolve(g.key);
    if (target === g.key) continue;
    const into = byKey.get(target)!;
    const from = byKey.get(g.key)!;
    into.txns.push(...from.txns);
    into.aliases.push(...from.aliases);
    into.total = Math.round((into.total + from.total) * 100) / 100;
    byKey.delete(g.key);
  }
  return [...byKey.values()];
}

export function App() {
  const saved = load<Prefs | null>(PREFS, null);
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(saved?.remember ?? false);
  const [payerState, setPayerState] = useState(saved?.payerState ?? '');
  const [businessId, setBusinessId] = useState(saved?.businessId ?? randomLabel());
  const [tags, setTags] = useState<Record<string, Tags>>(saved?.tags ?? {});
  const [merges, setMerges] = useState<Record<string, string>>(saved?.merges ?? {});
  // Never persisted: contains TINs and addresses.
  const [payer, setPayer] = useState<Party>(() => ({ ...emptyParty('B'), state: saved?.payerState ?? '' }));
  const [meta, setMeta] = useState<Record<string, PayeeMeta>>({});

  const persist = (p: Partial<Prefs>) => {
    const next: Prefs = { remember, payerState, businessId, tags, merges, ...p };
    if (next.remember) save(PREFS, next);
    else remove(PREFS);
  };

  const groups = useMemo(() => mergeGroups(groupPayees(files.flatMap((f) => f.parsed.txns)), merges), [files, merges]);
  const rows = useMemo(() => buildRows(groups, tags, payerState), [groups, tags, payerState]);

  async function reparse(f: File, method: LoadedFile['method'], flipSign: boolean): Promise<LoadedFile> {
    const { parseBrowserFile } = await import('../parse/read');
    const parsed = await parseBrowserFile(f, { ...(method ? { method } : {}), flipSign });
    return { file: f, parsed, method, flipSign };
  }

  async function add(list: File[]) {
    setBusy(true);
    try {
      const loaded = await Promise.all(list.map((f) => reparse(f, '', false)));
      setFiles((cur) => [...cur, ...loaded]);
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setFiles([]);
    setTags({});
    setMerges({});
    setMeta({});
    const id = randomLabel();
    setBusinessId(id);
    persist({ tags: {}, merges: {}, businessId: id });
  }

  return (
    <div class="app">
      <Upload
        files={files}
        busy={busy}
        onAdd={add}
        onRemove={(i) => setFiles((cur) => cur.filter((_, j) => j !== i))}
        onChange={async (i, patch) => {
          const cur = files[i];
          if (!cur) return;
          const next = await reparse(cur.file, patch.method ?? cur.method, patch.flipSign ?? cur.flipSign);
          setFiles((all) => all.map((f, j) => (j === i ? next : f)));
        }}
      />
      {rows.length > 0 && (
        <>
          <Payees
            rows={rows}
            states={STATES.states}
            payerState={payerState}
            onPayerState={(s) => {
              setPayerState(s);
              setPayer((p) => ({ ...p, state: p.state || s }));
              persist({ payerState: s });
            }}
            onTag={(key, patch) => {
              const row = rows.find((r) => r.group.key === key);
              if (!row) return;
              const next = { ...tags, [key]: { ...row.tags, ...patch } };
              setTags(next);
              persist({ tags: next });
            }}
            onMerge={(from, into) => {
              const next = { ...merges, [from]: into };
              setMerges(next);
              persist({ merges: next });
            }}
          />
          <Results rows={rows} />
          <Paid rows={rows} businessId={businessId} payer={payer} onPayer={setPayer} meta={meta} onMeta={(k, m) => setMeta((cur) => ({ ...cur, [k]: m }))} />
          <section class="session" aria-label="Session options">
            <label>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).checked;
                  setRemember(v);
                  persist({ remember: v });
                }}
              />{' '}
              Remember my tags on this device (never your files or TINs)
            </label>
            <button type="button" class="link" onClick={startOver}>
              Start over / next business
            </button>
          </section>
        </>
      )}
    </div>
  );
}
