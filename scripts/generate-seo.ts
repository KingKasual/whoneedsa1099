/**
 * Post-build static page generator: state pages, question pages, legal pages, sitemap, robots.
 * Pages are built from the same rules JSON the engine uses.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FEDERAL, STATES } from '../src/rules';
import type { StateRow } from '../src/rules';
import { QUESTIONS, type Question } from '../src/content/questions';
import { LEGAL } from '../src/content/legal';

const SITE = (process.env.VITE_SITE_URL ?? 'https://www.whoneedsa1099.com').replace(/\/$/, '');
const BEACON = process.env.VITE_CF_BEACON_TOKEN ?? '';
const OUT = process.argv[2] ?? 'dist';
const TODAY = new Date().toISOString().slice(0, 10);
const NEC = `$${(FEDERAL.rules.NEC_THRESHOLD?.amount ?? 0).toLocaleString('en-US')}`;

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON for a <script type="application/ld+json"> block; neutralize "</script". */
const ld = (o: unknown): string => JSON.stringify(o).replace(/</g, '\\u003c');

const urls: string[] = [];

function page(path: string, o: { title: string; description: string; body: string; jsonLd?: unknown[] }): void {
  const canonical = `${SITE}${path}`;
  urls.push(canonical);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)} | WhoNeedsA1099</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta name="theme-color" content="#0b5394">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/site.css">
${(o.jsonLd ?? []).map((j) => `<script type="application/ld+json">${ld(j)}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site"><div class="wrap"><a class="brand" href="/">WhoNeedsA1099</a><nav aria-label="Main"><a href="/questions/">Questions</a><a href="/states/">State rules</a></nav></div></header>
<main id="main" class="wrap article">
${o.body}
</main>
<footer class="site"><div class="wrap"><p>Not tax or legal advice. <a href="/disclaimer/">Disclaimer</a> · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> · Rules data v${esc(FEDERAL.version)}, states v${esc(STATES.version)}</p></div></footer>
${BEACON ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${ld({ token: BEACON })}'></script>` : ''}
</body>
</html>
`;
  const file = join(OUT, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const cta = `<div class="cta-box"><p><strong>Check your own payees in two minutes.</strong> Drop in your bank, card or bookkeeping exports. Everything runs in your browser.</p><p><a class="button" href="/">Run the free 1099 checker</a></p></div>`;

const crumbs = (items: [string, string][]): { html: string; json: unknown } => ({
  html: `<nav class="crumbs" aria-label="Breadcrumb">${items.map(([name, href], i) => (i < items.length - 1 ? `<a href="${href}">${esc(name)}</a> › ` : esc(name))).join('')}</nav>`,
  json: {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${href}` })),
  },
});

const faqLd = (faqs: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});

const faqHtml = (faqs: { q: string; a: string }[]): string =>
  `<h2>Common questions</h2><dl class="faq">${faqs.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('')}</dl>`;

// ---------- States ----------
function stateFaqs(s: StateRow): { q: string; a: string }[] {
  const fed = `The federal 1099-NEC threshold for payments made in 2026 is ${NEC}.`;
  if (!s.hasIncomeTax) {
    return [
      { q: `Does ${s.name} require 1099 filing in 2026?`, a: `${s.name} has no broad-based state personal income tax, so a separate state 1099-NEC/MISC filing is generally not required. ${fed} Verify any local requirements with the ${s.name} revenue department.` },
      { q: `What is the 1099 threshold in ${s.name} for 2026?`, a: `${fed} ${s.name} generally does not add its own 1099 filing requirement.` },
    ];
  }
  const thr = s.stateThreshold !== null ? `$${s.stateThreshold.toLocaleString('en-US')}` : null;
  const verified = s.status === 'verified';
  return [
    {
      q: `What is the 1099 threshold in ${s.name} for 2026?`,
      a: `${fed} ${thr ? `${s.name}'s state threshold is reported as ${thr}.` : `${s.name}'s state threshold for 2026 is not yet confirmed.`} ${verified ? '' : `We have not yet verified this against ${s.name}'s official guidance, so check the source below.`}`.trim(),
    },
    {
      q: `Do I file 1099s with ${s.name}?`,
      a: `${s.name} has a state income tax and may require you to file 1099s with the state or through the IRS Combined Federal/State Filing Program. ${s.notes}`,
    },
  ];
}

for (const s of STATES.states) {
  const path = `/states/${s.slug}/`;
  const title = `2026 1099 threshold in ${s.name}`;
  const c = crumbs([['Home', '/'], ['State rules', '/states/'], [s.name, path]]);
  const faqs = stateFaqs(s);
  const statusLine =
    s.status === 'verified'
      ? `<p>Verified against the source below on ${esc(s.lastReviewed ?? '')}.</p>`
      : `<p class="status-verify">Not yet verified for tax year 2026.</p><p>We haven't confirmed ${esc(s.name)}'s 2026 rule against official guidance yet. Our checker flags ${esc(s.name)} payees conservatively (at $${STATES.conservativeFallbackThreshold}) until we do. Check the ${esc(s.name)} revenue department before relying on this page.</p>`;
  page(path, {
    title,
    description: `${title}: the federal 1099-NEC threshold is ${NEC} for 2026. ${s.hasIncomeTax ? `How ${s.name} state filing compares.` : `${s.name} has no state income tax.`}`,
    jsonLd: [faqLd(faqs), c.json],
    body: `${c.html}
<h1>${esc(title)}</h1>
<p class="lede">${esc(faqs[0]!.a)}</p>
${statusLine}
<table><caption class="sr-only">${esc(s.name)} 1099 facts</caption><tbody>
<tr><th scope="row">Federal 1099-NEC threshold (2026)</th><td>${NEC}</td></tr>
<tr><th scope="row">State personal income tax</th><td>${s.hasIncomeTax ? 'Yes' : 'No'}</td></tr>
<tr><th scope="row">State threshold</th><td>${s.stateThreshold !== null ? `$${s.stateThreshold.toLocaleString('en-US')}` : s.hasIncomeTax ? 'Not yet confirmed' : 'n/a'}</td></tr>
<tr><th scope="row">Follows the federal $2,000 change</th><td>${esc(s.conformsToFederal)}</td></tr>
<tr><th scope="row">Notes</th><td>${esc(s.notes)}</td></tr>
<tr><th scope="row">Source</th><td><a href="${esc(s.sourceUrl)}" rel="noopener">${esc(s.sourceUrl)}</a></td></tr>
</tbody></table>
${faqHtml(faqs)}
${cta}
<p class="disclaimer">Not tax advice. State rules change; confirm with the ${esc(s.name)} revenue department or a tax professional.</p>`,
  });
}

page('/states/', {
  title: '2026 1099 thresholds by state',
  description: `State-by-state 1099 filing rules for tax year 2026, next to the new ${NEC} federal threshold. Every row links to its source.`,
  body: `<h1>2026 1099 thresholds by state</h1>
<p class="lede">The federal 1099-NEC/MISC threshold is ${NEC} for payments made in 2026. States don't all follow it. Rows marked <span class="status-verify">verify</span> haven't been checked against official 2026 guidance yet.</p>
<div class="table-wrap"><table><caption class="sr-only">State 1099 rules</caption><thead><tr><th scope="col">State</th><th scope="col">Income tax</th><th scope="col">State threshold</th><th scope="col">Status</th></tr></thead><tbody>
${STATES.states
  .map(
    (s) =>
      `<tr><th scope="row"><a href="/states/${s.slug}/">${esc(s.name)}</a></th><td>${s.hasIncomeTax ? 'Yes' : 'No'}</td><td>${s.stateThreshold !== null ? `$${s.stateThreshold.toLocaleString('en-US')}` : s.hasIncomeTax ? '?' : 'n/a'}</td><td>${s.status === 'verified' ? 'verified' : '<span class="status-verify">verify</span>'}</td></tr>`,
  )
  .join('\n')}
</tbody></table></div>${cta}`,
});

// ---------- Questions ----------
function questionPage(q: Question): void {
  const path = `/questions/${q.slug}/`;
  const c = crumbs([['Home', '/'], ['Questions', '/questions/'], [q.title, path]]);
  const sources = q.ruleIds
    .map((id) => FEDERAL.rules[id])
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map((x) => `<li>${esc(x.title)}: <a href="${esc(x.source)}" rel="noopener">${esc(x.source)}</a></li>`);
  const faqs = [{ q: q.title, a: q.answer }, ...q.faqs];
  page(path, {
    title: q.title,
    description: q.description,
    jsonLd: [faqLd(faqs), c.json],
    body: `${c.html}
<h1>${esc(q.title)}</h1>
<p class="lede"><strong>Short answer:</strong> ${esc(q.answer)}</p>
${q.body.map((p) => `<p>${esc(p)}</p>`).join('\n')}
${cta}
${faqHtml(q.faqs)}
<h2>Sources</h2><ul>${[...new Set(sources)].join('')}</ul>
<p class="disclaimer">Not tax advice. Last reviewed ${esc(FEDERAL.lastReviewed)} against rules data v${esc(FEDERAL.version)}.</p>`,
  });
}
QUESTIONS.forEach(questionPage);

page('/questions/', {
  title: '2026 1099 questions, answered',
  description: `Plain answers to the most common 1099-NEC and 1099-MISC questions under the new ${NEC} threshold.`,
  body: `<h1>2026 1099 questions, answered</h1><ul>${QUESTIONS.map((q) => `<li><a href="/questions/${q.slug}/">${esc(q.title)}</a></li>`).join('')}</ul>${cta}`,
});

// ---------- Legal ----------
for (const l of LEGAL) {
  page(`/${l.slug}/`, { title: l.title, description: l.description, body: `<h1>${esc(l.title)}</h1><p class="muted">Last updated ${esc(l.updated)}</p>${l.html}` });
}

// ---------- Home: inject analytics + JSON-LD into Vite's index.html ----------
const indexPath = join(OUT, 'index.html');
let index = readFileSync(indexPath, 'utf8');
const appLd = { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'WhoNeedsA1099', url: `${SITE}/`, applicationCategory: 'FinanceApplication', operatingSystem: 'Any', offers: [{ '@type': 'Offer', price: '0', priceCurrency: 'USD' }, { '@type': 'Offer', price: '19', priceCurrency: 'USD' }] };
index = index.replace('</head>', `<script type="application/ld+json">${ld(appLd)}</script>\n</head>`);
if (BEACON) index = index.replace('</body>', `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${ld({ token: BEACON })}'></script>\n</body>`);
writeFileSync(indexPath, index);
urls.unshift(`${SITE}/`);

writeFileSync(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}\n</urlset>\n`,
);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`SEO: wrote ${urls.length} URLs to ${OUT}`);
