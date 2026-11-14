/** Fails a production build that would ship something unsafe. Run in the deploy workflow. */
import { readFileSync } from 'node:fs';

const errors: string[] = [];
const site = process.env.VITE_SITE_URL ?? '';
if (!site.startsWith('https://')) errors.push('VITE_SITE_URL must be the real https domain.');
if (process.env.VITE_TEST_UNLOCK === 'true') errors.push('VITE_TEST_UNLOCK must not be set on a production build.');
if (process.env.VITE_PAYMENTS_ENABLED === 'true') {
  for (const f of ['1099-NEC', '1099-MISC']) {
    const t = JSON.parse(readFileSync(`src/export/iris-templates/${f}.ty2026.json`, 'utf8')) as { status: string };
    if (t.status !== 'official') errors.push(`${f} IRIS template is "${t.status}". Import the official TY2026 template before enabling payments.`);
  }
  if (!process.env.VITE_CHECKOUT_SINGLE_URL) errors.push('VITE_CHECKOUT_SINGLE_URL missing while payments are enabled.');
}
if (errors.length) {
  console.error('Release check failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log('Release check passed.');
