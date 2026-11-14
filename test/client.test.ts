import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSummaryPdf, buildSummary } from '../src/export/summary';
import { FEDERAL, evaluatePayee } from '../src/rules';

describe('PDF summary', () => {
  it('renders a one-page PDF, truncating long payee lists', async () => {
    const v = evaluatePayee({ id: 'a', name: 'a', category: 'services', isCorporation: 'no', hasTin: 'yes', payments: [{ date: '2026-01-01', amount: 3000, method: 'bank' }] }, FEDERAL);
    const m = buildSummary({ business: 'Biz', generatedOn: '2026-11-14', rulesVersion: FEDERAL.version, payees: Array.from({ length: 60 }, (_, i) => ({ name: `Payee ${i}`, verdict: v, w9: 'received' })), deadlines: FEDERAL.deadlines });
    const blob = await renderSummaryPdf(m);
    const text = Buffer.from(await blob.arrayBuffer()).toString('latin1');
    expect(text.startsWith('%PDF')).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
});

describe('license client', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('verifies, activates once per business, and persists only key + random labels', async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      if (url.endsWith('validate')) return new Response(JSON.stringify({ valid: true, plan: 'pack', businessesAllowed: 15, reason: null }));
      return new Response(JSON.stringify({ ok: true, activationId: 'x' }));
    });
    const { verifyKey, activateBusiness, getLicense, clearLicense } = await import('../src/lib/license');
    const st = await verifyKey('KEY-12345678');
    const a = await activateBusiness(st, 'biz1');
    await activateBusiness(a, 'biz1');
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body).toEqual({ key: 'KEY-12345678', label: expect.stringMatching(/^biz-[a-f0-9]{24}$/) });
    expect(getLicense()?.activations.biz1).toMatch(/^biz-/);
    clearLicense();
    expect(getLicense()).toBeNull();
  });

  it('surfaces friendly errors', async () => {
    const { verifyKey, activateBusiness } = await import('../src/lib/license');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ valid: false, reason: 'not_found' })));
    await expect(verifyKey('KEY-12345678')).rejects.toThrow(/not found/);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ valid: false, reason: 'revoked' })));
    await expect(verifyKey('KEY-12345678')).rejects.toThrow(/revoked/);
    vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
    await expect(verifyKey('KEY-12345678')).rejects.toThrow(/not enabled/);
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
    await expect(verifyKey('KEY-12345678')).rejects.toThrow(/unavailable/);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: false, reason: 'activation_limit' })));
    const st = { key: 'K', plan: 'single' as const, businessesAllowed: 1, activations: {}, checkedAt: '' };
    await expect(activateBusiness(st, 'b2')).rejects.toThrow(/All 1 business slots/);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: false, reason: 'not_found' })));
    await expect(activateBusiness(st, 'b2')).rejects.toThrow(/Could not activate/);
  });

  it('storage never throws when localStorage is blocked', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } });
    const s = await import('../src/lib/storage');
    expect(s.load('x', 5)).toBe(5);
    expect(() => s.save('x', 1)).not.toThrow();
    expect(() => s.remove('x')).not.toThrow();
  });
});
