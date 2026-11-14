import { describe, expect, it, vi } from 'vitest';
import { handle, type Env } from '../worker/src/index';

const env: Env = {
  PAYMENTS_ENABLED: 'true',
  POLAR_API_BASE: 'https://sandbox-api.polar.sh',
  POLAR_ORG_ID: 'org_1',
  POLAR_BENEFIT_SINGLE: 'ben_single',
  POLAR_BENEFIT_PACK: 'ben_pack',
  ALLOWED_ORIGINS: 'http://localhost:5173',
};

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://x.test${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });

const upstream = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('license worker', () => {
  it('validates a granted pack key and only sends key + org id upstream', async () => {
    const f = upstream(200, { id: 'lk', benefit_id: 'ben_pack', status: 'granted', limit_activations: 15, expires_at: null });
    const res = await handle(post('/api/license/validate', { key: 'ABCD-1234-EFGH' }), env, f as unknown as typeof fetch);
    expect(await res.json()).toEqual({ valid: true, plan: 'pack', businessesAllowed: 15, expiresAt: null, reason: null });
    const [url, init] = (f.mock.calls[0] as unknown as [string, RequestInit]);
    expect(url).toBe('https://sandbox-api.polar.sh/v1/customer-portal/license-keys/validate');
    expect(JSON.parse(init.body as string)).toEqual({ key: 'ABCD-1234-EFGH', organization_id: 'org_1' });
  });

  it('rejects revoked, expired, and unknown-product keys', async () => {
    const r1 = await handle(post('/api/license/validate', { key: 'ABCD12345' }), env, upstream(200, { benefit_id: 'ben_single', status: 'revoked', limit_activations: 1, expires_at: null }) as unknown as typeof fetch);
    expect(await r1.json()).toMatchObject({ valid: false, reason: 'revoked' });
    const r2 = await handle(post('/api/license/validate', { key: 'ABCD12345' }), env, upstream(200, { benefit_id: 'ben_single', status: 'granted', limit_activations: null, expires_at: '2020-01-01T00:00:00Z' }) as unknown as typeof fetch);
    expect(await r2.json()).toMatchObject({ valid: false, reason: 'expired', businessesAllowed: 1 });
    const r3 = await handle(post('/api/license/validate', { key: 'ABCD12345' }), env, upstream(200, { benefit_id: 'other', status: 'granted', limit_activations: null, expires_at: null }) as unknown as typeof fetch);
    expect(await r3.json()).toMatchObject({ valid: false, reason: 'unknown_product' });
    const r4 = await handle(post('/api/license/validate', { key: 'ABCD12345' }), env, upstream(404, {}) as unknown as typeof fetch);
    expect(await r4.json()).toEqual({ valid: false, reason: 'not_found' });
    const r5 = await handle(post('/api/license/validate', { key: 'ABCD12345' }), env, upstream(500, {}) as unknown as typeof fetch);
    expect(r5.status).toBe(502);
  });

  it('activates with a random label; maps limit to activation_limit', async () => {
    const label = 'biz-0123456789abcdef';
    const ok = await handle(post('/api/license/activate', { key: 'ABCD12345', label }), env, upstream(200, { id: 'act_1' }) as unknown as typeof fetch);
    expect(await ok.json()).toEqual({ ok: true, activationId: 'act_1' });
    const lim = await handle(post('/api/license/activate', { key: 'ABCD12345', label }), env, upstream(403, {}) as unknown as typeof fetch);
    expect(await lim.json()).toEqual({ ok: false, reason: 'activation_limit' });
    const nf = await handle(post('/api/license/activate', { key: 'ABCD12345', label }), env, upstream(404, {}) as unknown as typeof fetch);
    expect(await nf.json()).toEqual({ ok: false, reason: 'not_found' });
    const err = await handle(post('/api/license/activate', { key: 'ABCD12345', label }), env, upstream(500, {}) as unknown as typeof fetch);
    expect(err.status).toBe(502);
    const bad = await handle(post('/api/license/activate', { key: 'ABCD12345', label: 'Acme Plumbing' }), env);
    expect(bad.status).toBe(400);
  });

  it('input validation, flag, routing, CORS', async () => {
    expect((await handle(post('/api/license/validate', '{bad'), env)).status).toBe(400);
    expect((await handle(post('/api/license/validate', { key: 'x' }), env)).status).toBe(400);
    expect((await handle(post('/api/license/validate', { key: 'ABCD12345' }), { ...env, PAYMENTS_ENABLED: 'false' })).status).toBe(503);
    expect((await handle(post('/api/license/nope', { key: 'ABCD12345' }), env, upstream(200, {}) as unknown as typeof fetch)).status).toBe(404);
    expect((await handle(new Request('https://x.test/api/license/validate'), env)).status).toBe(405);
    expect((await handle(new Request('https://x.test/other'), env)).status).toBe(404);
    const health = await handle(new Request('https://x.test/api/health'), env);
    expect(await health.json()).toEqual({ ok: true, payments: true });
    const pre = await handle(new Request('https://x.test/api/license/validate', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }), env);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    const evil = await handle(new Request('https://x.test/api/health', { headers: { Origin: 'https://evil.test' } }), env);
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const down = await handle(post('/api/license/validate', { key: 'ABCD12345' }), env, (async () => { throw new Error('net'); }) as unknown as typeof fetch);
    expect(down.status).toBe(502);
  });
});
