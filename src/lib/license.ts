/** Client side of license unlock. Sends only the key and a random per-business label. */
import { load, save, remove } from './storage';

export interface LicenseState {
  key: string;
  plan: 'single' | 'pack';
  businessesAllowed: number;
  /** Random labels for businesses activated from this browser. */
  activations: Record<string, string>;
  checkedAt: string;
}

const KEY = 'wg1099.license';

export const getLicense = (): LicenseState | null => load<LicenseState | null>(KEY, null);
export const clearLicense = (): void => remove(KEY);

export function randomLabel(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return 'biz-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/license/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 503) throw new Error('Payments are not enabled yet.');
  if (!res.ok) throw new Error('License server unavailable. Try again in a minute.');
  return (await res.json()) as T;
}

export async function verifyKey(key: string): Promise<LicenseState> {
  const r = await call<{ valid: boolean; plan: 'single' | 'pack' | null; businessesAllowed: number; reason: string | null }>('validate', { key });
  if (!r.valid || !r.plan) throw new Error(r.reason === 'not_found' ? 'That license key was not found.' : `License not valid (${r.reason ?? 'unknown'}).`);
  const prev = getLicense();
  const state: LicenseState = { key, plan: r.plan, businessesAllowed: r.businessesAllowed, activations: prev?.key === key ? prev.activations : {}, checkedAt: new Date().toISOString() };
  save(KEY, state);
  return state;
}

/** Uses one business slot for `businessId` (a local random id), once per browser. */
export async function activateBusiness(state: LicenseState, businessId: string): Promise<LicenseState> {
  if (state.activations[businessId]) return state;
  const label = randomLabel();
  const r = await call<{ ok: boolean; reason?: string }>('activate', { key: state.key, label });
  if (!r.ok) throw new Error(r.reason === 'activation_limit' ? `All ${state.businessesAllowed} business slots on this key are used.` : 'Could not activate this business.');
  const next = { ...state, activations: { ...state.activations, [businessId]: label } };
  save(KEY, next);
  return next;
}
