# Commands

CLAUDE.md keeps the daily set (`dev`, `build`, `lint`, `test:e2e`). Everything below is the long tail — read when you need the specific script.

## Daily

```bash
npm run dev          # Dev server (Cortex on http://localhost:3001)
npm run build        # Production build
npm run lint         # ESLint
npx tsc --noEmit     # Type-check
```

## Tests

```bash
npm run test:ad-library         # Vitest — Meta Ad Library URL extraction (extract-ad-library-urls)
npx tsx scripts/test-ad-library-scrape.ts "<facebook ads library url>"  # Live fetch + print extracted image URLs (no API/auth)

npm run test:e2e        # Playwright — full matrix (tests/*.spec.ts); dev server must return 200 on GET /api/health
npm run test:e2e:routes # Redirect + API security only (no login UI shells)
npm run test:e2e:shells # Login page UI smoke + health retry
```

Full signed-in crawl (admin: all static routes + first client + history links + first presentation; portal: all static routes):

```bash
E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e
E2E_PORTAL_EMAIL=… E2E_PORTAL_PASSWORD=… npm run test:e2e
# PLAYWRIGHT_SKIP_WEBSERVER=1 — do not spawn npm run dev
# PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 — alternate origin
```

## Ads / creatives (one-offs)

```bash
npm run ads:ecoview:50         # EcoView — 50 Nano "Meta performance mix" ads (Brand DNA guideline required)
npm run ads:ecoview:regenerate # Delete all global (Nano) creatives for the client, then queue 50 new ads (Brand DNA required)
npm run ads:queue-nano-meta:dry # Print batch config only (any client: NANO_META_CLIENT_ID, NANO_META_AD_COUNT)
```

Goldback local PNGs → client gallery (CLI outputs never auto-link to a client):

```bash
GOLDBACK_IMPORT_DIR=~/Desktop/<Goldback-Idaho-Gemini-…> \
GOLDBACK_ADS_JSON=~/Desktop/Goldback-Meta-Top100/100-ads.generated.json \
GOLDBACK_CLIENT_ID=<uuid> \
npm run ads:goldback:import
# Or omit CLIENT_ID if a single client matches slug `goldback` or name %goldback%
# (set GOLDBACK_CLIENT_SLUG if needed).
```

## Kandy templates

```bash
npm run kandy:upload   # Local Kandy export folders → Supabase kandy_templates (scripts/upload-kandy-templates.ts)
npm run kandy:analyze  # Backfill prompt_schema for templates missing analysis
```

## Supabase migrations

```bash
npm run supabase:migrate    # Apply pending migrations (065+ by default; uses schema_migrations; needs SUPABASE_DB_URL in .env.local)
npm run supabase:apply-065  # One-off: 065_brand_dna_jobs_updated_at.sql only
npm run supabase:apply-053  # Run migration 053 SQL via Postgres (needs SUPABASE_DB_URL — Dashboard → Database → URI)
# `npm run dev` runs `predev` → `supabase:migrate` first (skips quietly if no DB URL).
```
