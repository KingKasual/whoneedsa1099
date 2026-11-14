/**
 * License verification Worker. The only server code in the product.
 * It receives a license key (and an opaque random per-business label) and NOTHING else:
 * no financial data, no names, no TINs.
 */

export interface Env {
  /** "true" to enable; anything else returns 503 for license calls. */
  PAYMENTS_ENABLED: string;
  /** https://sandbox-api.polar.sh or https://api.polar.sh */
  POLAR_API_BASE: string;
  POLAR_ORG_ID: string;
  /** Benefit ids (license-key benefits) for each plan. */
  POLAR_BENEFIT_SINGLE: string;
  POLAR_BENEFIT_PACK: string;
  /** Comma-separated origins allowed for CORS (dev only; production is same-origin). */
  ALLOWED_ORIGINS: string;
}

type Plan = 'single' | 'pack';

interface PolarValidated {
  id: string;
  benefit_id: string;
  status: 'granted' | 'revoked' | 'disabled';
  limit_activations: number | null;
  expires_at: string | null;
  activation?: { id: string } | null;
}

const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
const LABEL_RE = /^biz-[a-f0-9]{16,64}$/;

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
    : {};
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
  });
}

function planFor(env: Env, benefitId: string): Plan | null {
  if (benefitId === env.POLAR_BENEFIT_PACK) return 'pack';
  if (benefitId === env.POLAR_BENEFIT_SINGLE) return 'single';
  return null;
}

async function polar(env: Env, path: string, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(`${env.POLAR_API_BASE}/v1/customer-portal/license-keys/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...body, organization_id: env.POLAR_ORG_ID }),
  });
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(req.url);
  const h = cors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (url.pathname === '/api/health') return json({ ok: true, payments: env.PAYMENTS_ENABLED === 'true' }, 200, h);
  if (!url.pathname.startsWith('/api/license/')) return json({ error: 'not_found' }, 404, h);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, h);
  if (env.PAYMENTS_ENABLED !== 'true') return json({ error: 'payments_disabled' }, 503, h);

  let input: { key?: unknown; label?: unknown };
  try {
    input = (await req.json()) as typeof input;
  } catch {
    return json({ error: 'bad_json' }, 400, h);
  }
  const key = typeof input.key === 'string' ? input.key.trim() : '';
  if (!KEY_RE.test(key)) return json({ error: 'invalid_key_format' }, 400, h);

  const action = url.pathname.slice('/api/license/'.length);
  try {
    if (action === 'validate') {
      const res = await polar(env, 'validate', { key }, fetchImpl);
      if (res.status === 404) return json({ valid: false, reason: 'not_found' }, 200, h);
      if (!res.ok) return json({ error: 'upstream', status: res.status }, 502, h);
      const lk = (await res.json()) as PolarValidated;
      const plan = planFor(env, lk.benefit_id);
      const expired = lk.expires_at !== null && Date.parse(lk.expires_at) < Date.now();
      const valid = lk.status === 'granted' && plan !== null && !expired;
      return json(
        { valid, plan, businessesAllowed: lk.limit_activations ?? (plan === 'pack' ? 15 : 1), expiresAt: lk.expires_at, reason: valid ? null : expired ? 'expired' : lk.status !== 'granted' ? lk.status : 'unknown_product' },
        200,
        h,
      );
    }
    if (action === 'activate') {
      const label = typeof input.label === 'string' ? input.label : '';
      if (!LABEL_RE.test(label)) return json({ error: 'invalid_label' }, 400, h);
      const res = await polar(env, 'activate', { key, label }, fetchImpl);
      if (res.status === 403) return json({ ok: false, reason: 'activation_limit' }, 200, h);
      if (res.status === 404) return json({ ok: false, reason: 'not_found' }, 200, h);
      if (!res.ok) return json({ error: 'upstream', status: res.status }, 502, h);
      const a = (await res.json()) as { id: string };
      return json({ ok: true, activationId: a.id }, 200, h);
    }
  } catch {
    return json({ error: 'upstream_unreachable' }, 502, h);
  }
  return json({ error: 'not_found' }, 404, h);
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env);
  },
};
