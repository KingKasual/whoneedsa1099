# WhoGetsA1099

Privacy-first 1099-NEC/MISC checker for tax year 2026. All file parsing and rule evaluation runs in the browser; the only server code is a license-key Worker that sees a key and a random label.

## Layout

| Path | What |
|---|---|
| `src/rules/` | Pure rules engine + `federal-ty2026.json` + `states-ty2026.json` (versioned; every row has a source URL) |
| `src/parse/` | CSV/XLSX → transactions (bank, Chase/Amex card, PayPal, Venmo, QuickBooks, Wave, Xero) + fuzzy payee grouping |
| `src/export/` | IRIS CSV (template-driven), W-9 kit, `.ics`, PDF summary |
| `src/export/iris-templates/` | IRIS column templates. **Currently `placeholder`**. See "IRIS templates" |
| `src/ui/` | Preact app |
| `src/content/` | Question pages + Terms/Privacy/Disclaimer |
| `scripts/generate-seo.ts` | Post-build static pages: 50 states, 15 questions, legal, sitemap, robots, FAQ JSON-LD |
| `worker/` | Cloudflare Worker: `/api/license/validate`, `/api/license/activate` (Polar) |

## Commands

```bash
npm run dev          # app at :5173 (dev build shows a "Dev only: unlock locally" button)
npm run coverage     # tests + coverage (rules engine gate: 90%)
npm run build        # typecheck + vite build + static SEO pages into dist/
npm run iris:import -- <official-template.csv> 1099-NEC   # swap in an official IRIS template
```

## Updating rules

- Federal: edit `src/rules/federal-ty2026.json`, bump `version`, run tests.
- States: edit a row in `src/rules/states-ty2026.json`. Only set `"status": "verified"` together with `lastReviewed` and a primary-source `sourceUrl`. Unverified rows are flagged conservatively at `conservativeFallbackThreshold`.
- `BACKUP_WITHHOLDING.appliesBelowThreshold` (default `false`) controls whether no-TIN payees under the threshold get the 24% warning or a "collect a W-9" notice.

## IRIS templates

The official TY2026 IRIS CSV templates are downloaded from inside the IRIS Taxpayer Portal. Download each (NEC, MISC) and run `npm run iris:import`. Review any "unrecognized headers" it prints. `npm run check:release` refuses a deploy with `PAYMENTS_ENABLED=true` while either template is still `placeholder`.

## Deploy (GitHub Actions → Cloudflare)

Secrets (Settings → Secrets → Actions): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Variables (Settings → Variables → Actions): `SITE_DOMAIN`, `CF_PAGES_PROJECT`, `PAYMENTS_ENABLED` (`false` until launch), `POLAR_API_BASE` (`https://sandbox-api.polar.sh` → `https://api.polar.sh`), `POLAR_ORG_ID`, `POLAR_BENEFIT_SINGLE`, `POLAR_BENEFIT_PACK`, `CHECKOUT_SINGLE_URL`, `CHECKOUT_PACK_URL`, `CF_BEACON_TOKEN`, `SELLER_NAME`, `CONTACT_EMAIL`.

The license Worker calls Polar's public customer-portal license-key endpoints, which need only the organization id, so no Polar token is stored anywhere.
