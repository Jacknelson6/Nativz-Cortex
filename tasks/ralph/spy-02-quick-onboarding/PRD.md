# PRD: SPY · 02 · Quick brand onboarding (URL paste → prospect in <30s)

> Spying → Prospect Pipeline · 02/10 · 2026-05-10

## Purpose & Value

Optimise for time-to-value on a live sales call. A sales rep pastes a single URL (website or social profile) and Cortex returns a saved `prospects` row plus a confirm-platforms surface in under 30 seconds, with the heavy SPY-03 initial analysis auto-firing in the background so a toast pops within ~90s. The sales rep never sits in awkward silence; the prospect record exists before the conversation moves on.

## Problem

Creating a record today means either running a full prospect_audit (90 to 120s of synchronous wait) or hand-typing the brand into `/admin/prospects/new` and re-entering socials. Neither belongs on a live call. SPY-01 gave us a durable `prospects` table; this PRD gives us the fast path that fills it.

## Primary User

Sales rep on a live call (Jack or future sales hire). Secondary: strategist seeding a prospect cold ahead of a discovery call.

## SMART Goals

- p50 time from URL paste to prospect record visible: ≤ 15s.
- p95 time from URL paste to prospect record visible: ≤ 30s.
- ≥ 85% of URL pastes auto-detect at least one social handle with no manual round-trip.
- 100% of detection failures show an inline retry + manual-entry path (no dead ends).
- SPY-03 initial analysis kicks off within 2s of detection confirmation and reports back via toast within 120s.

## User Stories

- **US-01** — As a sales rep, I open `/admin/prospects/new`, paste `https://brand.com`, click "Go", and a prospect row is created within ~15s with brand name, favicon, and detected socials.
- **US-02** — As a sales rep, I see auto-detected socials rendered as confirm-platforms badges (high-confidence = checked, ambiguous = picker), exactly mirroring the audit confirm UI.
- **US-03** — As a sales rep, I can override a wrong auto-detection inline (delete a handle, paste a corrected one) and re-confirm without losing my place.
- **US-04** — As a sales rep, I can paste a social profile URL (e.g. `https://www.tiktok.com/@brand`) and onboarding still works, seeding `primary_platform` + `primary_handle` directly.
- **US-05** — As a system, once detection is confirmed, SPY-03 initial analysis auto-fires and a toast surfaces success/failure.
- **US-06** — As a sales rep, when the website scrape fails, I can still save a bare prospect record with manual handle entry (no dead end).

## In Scope

- New route: `app/admin/prospects/new/page.tsx` (client + server split, see UI section).
- New API: `POST /api/prospects/onboard` accepts a URL, returns a fresh `prospects` row + detection payload + signed handle resolution candidates.
- New API: `POST /api/prospects/[id]/confirm-socials` accepts the user's confirmed socials, persists to `prospect_socials`, kicks SPY-03 analysis.
- Detection pipeline reusing existing scrapers (no new scrapers):
  - URL classifier: `lib/prospects/url-classifier.ts` — categorises seed URL as `website` or `social_profile:<platform>`.
  - Website branch: `lib/audit/scrape-website.ts` for brand metadata + socials.
  - Social-profile branch: skip website scrape, use `lib/audit/search-competitor-socials.ts` with handle as seed to enrich cross-platform.
  - Disambiguation: `lib/audit/search-competitor-socials.ts` resolves ambiguous handles when website scrape returns multiple candidates per platform.
- Confirm-platforms inline UI (no full page redirect): reuses the visual language of `components/audit/audit-report.tsx` confirm-platforms screen.
- Auto-fire of SPY-03 `runInitialAnalysis()` once socials confirmed.
- Touchpoint entry of kind `state_change` (body: `Onboarded via quick paste`) written on creation.
- Sidebar "+ New prospect" CTA links here (was a stub in SPY-01).

## Out of Scope

- Initial analysis itself (SPY-03 owns).
- PDF deliverable (SPY-04).
- Competitor analysis (SPY-05).
- Bulk CSV import.
- Onboarding from email screenshots or PDFs.
- Browser extension surface.

## Resolved Decisions

- **D-01** — Accept social profile URLs as the seed? **→ Yes.** Rationale: sales reps often have only the handle; forcing them to find a website wastes time. URL classifier handles routing.
- **D-02** — Run SPY-03 analysis synchronously or async? **→ Async with toast.** Rationale: 30s ceiling is non-negotiable; analysis takes ~90s. Fire-and-forget via direct internal `runInitialAnalysis` call wrapped in `Promise.resolve().then(...)` so the API returns immediately.
- **D-03** — Failed website scrape — block or save bare? **→ Save with `lifecycle_state='discovered'`, no socials, flag `metadata.detection_failed=true` so the UI prompts manual entry.** Rationale: never strand the rep with nothing to show.
- **D-04** — Dedupe behaviour when seed URL maps to an existing prospect? **→ Match on canonicalised website host OR `(primary_platform, primary_handle)`. If match, return existing record with HTTP 200 + flag `existed: true`.** Rationale: prevents accidental dupes when re-pasting; idempotent.
- **D-05** — Brand name fallback ordering? **→ (1) `<title>` minus suffix patterns ("| Shop", "- Official", etc.), (2) Open Graph `og:site_name`, (3) website host minus TLD, (4) `@handle`.** Rationale: deterministic, no LLM cost.
- **D-06** — Where does the favicon come from? **→ `https://www.google.com/s2/favicons?domain=<host>&sz=128`, cached at scrape time into Supabase Storage via `lib/audit/persist-scraped-images.ts`.** Rationale: cheap, reliable, dark-themed UI shows them on `bg-surface`.
- **D-07** — How is `primary_platform` chosen? **→ Priority order TikTok > Instagram > YouTube > Facebook from detected socials, override-able in confirm step.** Rationale: short-form-first; reps can flip on the confirm screen.
- **D-08** — What auth gate? **→ Admin only (`createAdminClient()` after role check via `createServerSupabaseClient()`).** Rationale: prospects are agency-internal per SPY-01 D-05.
- **D-09** — Analysis trigger transport? **→ Direct in-process call to `lib/prospects/initial-analysis.ts#runInitialAnalysis()` after returning the JSON response; no queue, no cron.** Rationale: analysis is ≤ 90s, well under serverless 300s budget set on the route via `maxDuration = 300`.
- **D-10** — Do we write a `prospect_audits` row too? **→ No.** Rationale: SPY-01 D-01 keeps `prospect_audits` as legacy artifact; new prospects go straight into `prospects` with `source='manual'`.

## Data Model

No new tables. Reuses `prospects`, `prospect_socials`, `prospect_touchpoints` from SPY-01 migration 277. No migration in this PRD.

Columns touched on insert:

- `prospects`: brand_name, website_url, primary_platform, primary_handle, niche (null v1), source='manual', source_ref_id=null, owner_user_id=current user, created_by=current user, lifecycle_state='discovered'.
- `prospect_socials`: one row per confirmed platform.
- `prospect_touchpoints`: one row kind='state_change' on initial create, one row kind='state_change' on lifecycle transition to 'audited' when SPY-03 finishes.

## API Contracts

### `POST /api/prospects/onboard`

Auth: admin (`createServerSupabaseClient()` for user, role check via `users.role IN ('admin','super_admin')`).

Route config: `export const maxDuration = 60; export const dynamic = 'force-dynamic';`

Request:
```ts
const RequestSchema = z.object({
  url: z.string().url().max(2048),
  // Optional pre-typed name to seed; overridden by scrape if scrape returns one.
  brand_name_hint: z.string().min(1).max(200).optional(),
});
```

Response (200, fresh create):
```ts
{
  prospect: ProspectRow;                     // see lib/prospects/types.ts
  detection: {
    classified_as: 'website' | 'social_profile';
    platform_seed: 'tiktok' | 'instagram' | 'youtube' | 'facebook' | null;
    brand_name: string;
    favicon_url: string | null;
    website_url: string | null;
    socials: Array<{
      platform: 'tiktok' | 'instagram' | 'youtube' | 'facebook';
      handle: string;
      profile_url: string | null;
      display_name: string | null;
      confidence: 'high' | 'medium' | 'low';
      candidates: Array<{ handle: string; profile_url: string; reason: string }>;
    }>;
    detection_failed: boolean;
    detection_message: string | null;       // human-readable failure reason
  };
  existed: false;
}
```

Response (200, duplicate):
```ts
{
  prospect: ProspectRow;
  existed: true;
  message: 'Prospect already exists, opened existing record.';
}
```

Errors:
- 400 invalid input (Zod fail).
- 401 unauthorized.
- 403 not admin.
- 422 url could not be classified (e.g. mailto:, javascript:).
- 502 upstream scraper failure (still returns a stub prospect; surfaces `detection_failed=true`). Status 200 with `detection_failed=true` is preferred over 502 when the prospect row was created.

### `POST /api/prospects/[id]/confirm-socials`

Auth: admin.

Request:
```ts
const RequestSchema = z.object({
  primary_platform: z.enum(['tiktok','instagram','youtube','facebook']).nullable(),
  primary_handle: z.string().min(1).max(120).nullable(),
  socials: z.array(z.object({
    platform: z.enum(['tiktok','instagram','youtube','facebook']),
    handle: z.string().min(1).max(120),
    profile_url: z.string().url().nullable().optional(),
    display_name: z.string().max(200).nullable().optional(),
  })).max(8),
  trigger_analysis: z.boolean().default(true),
});
```

Behaviour:
1. Upsert `prospect_socials` rows scoped to this prospect (delete missing, upsert provided, UNIQUE(prospect_id, platform) enforced by SPY-01 index).
2. Patch `prospects.primary_platform`, `prospects.primary_handle`.
3. Insert `prospect_touchpoints` kind='state_change', body='Socials confirmed'.
4. If `trigger_analysis`, fire `runInitialAnalysis(prospect_id)` in background (do not await before responding).

Response (200):
```ts
{ prospect: ProspectRow; socials: ProspectSocialRow[]; analysis_triggered: boolean }
```

Errors: 400, 401, 403, 404 prospect not found.

## LLM Prompts

None. Brand name resolution is deterministic (D-05). Social detection reuses existing scraper logic. LLM-driven work lives in SPY-03.

## UI Components

### `app/admin/prospects/new/page.tsx`

Server component shell that renders the client `<QuickOnboardForm />`. No data fetched server-side beyond user role check.

Layout:
- Page header: H1 "New prospect" (sentence case), subtitle "Paste a website or social profile URL".
- Single column max-w-2xl center.
- `<QuickOnboardForm />`.

### `components/prospects/quick-onboard-form.tsx`

Client component (`'use client'`).

Props: none (route-level).

State machine (single useState `step`):
- `'idle'` — URL textarea + Go button.
- `'detecting'` — spinner + "Scanning…" + cancel button (aborts fetch).
- `'confirm'` — confirm-platforms inline UI.
- `'done'` — auto-redirects to `/admin/prospects/${id}` via `router.replace` after 600ms grace so the toast can show.
- `'error'` — error card + retry button.

Layout:
- Idle: large input (h-14 text-base placeholder "https://brand.com or https://www.tiktok.com/@brand"), primary button "Go" right-aligned. `bg-surface` card, accent border on focus.
- Detecting: skeleton row showing favicon placeholder + brand name placeholder + 4 platform pill skeletons. Subtitle "Scanning website and resolving handles…" centered.
- Confirm: header shows favicon + brand_name (editable input) + website (editable). Below, 4-row grid (one per platform) with: platform icon, detected handle as chip, "use other" expand showing candidate list, manual paste input, checkbox to include this platform. Primary CTA "Save prospect" (sentence case, never wraps).
- Done: brief checkmark + "Prospect saved. Running analysis…" then redirect.
- Error: IconCard with `AlertTriangle` icon, message, "Try again" button, "Save bare prospect" secondary button.

Copy (exact, sentence case):
- Idle button: "Go"
- Detecting subtitle: "Scanning website and resolving handles"
- Confirm primary CTA: "Save prospect"
- Confirm secondary: "Cancel"
- Done toast: "Prospect saved. Initial analysis running, check back in about a minute."
- Error save-bare button: "Save bare prospect"
- Error retry: "Try again"

States (loading / empty / error / success):
- All four states implemented (no `null`-return).
- Disable submit while `step !== 'idle' && step !== 'confirm'`.
- After redirect, the destination page shows a "Analysis pending" pill (component below).

Tokens: `bg-surface`, `text-foreground`, `accent-text` for primary CTA, `border-border`.

### `components/prospects/platform-confirm-row.tsx`

Client. Props:
```ts
type Props = {
  platform: 'tiktok' | 'instagram' | 'youtube' | 'facebook';
  detection: {
    handle: string | null;
    profile_url: string | null;
    confidence: 'high' | 'medium' | 'low';
    candidates: Array<{ handle: string; profile_url: string; reason: string }>;
  };
  included: boolean;
  manualOverride: { handle: string; profile_url: string } | null;
  onToggle(included: boolean): void;
  onPickCandidate(candidate: { handle: string; profile_url: string }): void;
  onManualOverride(value: { handle: string; profile_url: string } | null): void;
  onSetPrimary(): void;
  isPrimary: boolean;
};
```
Layout: single row, platform pill on left, current selected handle in middle (truncate, max-w-xs), confidence dot (green/amber/grey), kebab on right with "Use other…" / "Paste manually…" / "Set as primary".

### `components/prospects/analysis-pending-pill.tsx`

Server-renderable. Props: `{ prospectId: string; lastTouchedAt: string }`. Shows "Analyzing…" with spinner if no `prospect_analyses` row exists yet; replaced by SPY-03's analysis card when complete. Polls via `useSWR` every 5s with stop condition.

### `components/layout/admin-sidebar.tsx` (modify)

Confirm the "Prospects" entry from SPY-01 is in place. No changes here beyond verifying.

## File Map

Create:
- `app/admin/prospects/new/page.tsx`
- `app/api/prospects/onboard/route.ts`
- `app/api/prospects/[id]/confirm-socials/route.ts`
- `components/prospects/quick-onboard-form.tsx`
- `components/prospects/platform-confirm-row.tsx`
- `components/prospects/analysis-pending-pill.tsx`
- `lib/prospects/url-classifier.ts`
- `lib/prospects/url-classifier.test.ts`
- `lib/prospects/detect-socials.ts` (thin orchestrator wrapping scrape-website + search-competitor-socials)
- `lib/prospects/detect-socials.test.ts`
- `lib/prospects/onboard-from-url.ts` (server-side orchestrator returning the detection payload + persisted prospect row)
- `tasks/ralph/spy-02-quick-onboarding/progress.txt`

Modify:
- `app/admin/prospects/page.tsx` — wire the "+ New prospect" CTA to `/admin/prospects/new` (was a stub in SPY-01).
- `app/admin/prospects/[id]/page.tsx` — mount `<AnalysisPendingPill />` in the Analysis tab placeholder.

## Env Vars

None new. Reuses `APIFY_TOKEN`, `OPENROUTER_API_KEY` (latter only via SPY-03 trigger; SPY-02 itself doesn't call LLM).

## Edge Cases

- **Seed URL is a social profile** (e.g. `https://www.tiktok.com/@brand`): classifier sets `classified_as='social_profile'`, `platform_seed='tiktok'`, `prospects.primary_platform='tiktok'`, skip website scrape, run cross-platform handle search.
- **Seed URL redirects 5 hops**: follow up to 5 redirects, use final URL host as canonical. If more than 5, treat as classification failure (422 path).
- **URL is shortened (bit.ly, tinyurl)**: expand via single HEAD fetch; if expansion fails, classify the shortlink itself as a website.
- **URL is `https://linktr.ee/<x>`**: classify as website but parse outgoing handles from linktree HTML (linktree pages list socials cleanly).
- **Duplicate seed URL on second paste**: D-04, dedupe by canonicalised host OR `(primary_platform, primary_handle)`.
- **Multiple Instagram handles found** (e.g. localised brand variants): present all as `candidates`; user picks. If only one with `confidence='high'`, auto-include.
- **Detection times out** (>20s): cancel scrape, return `detection_failed=true` with a stub prospect.
- **User abandons confirm screen**: prospect row persists with `lifecycle_state='discovered'` and no `prospect_socials`; visible in main list, can be resumed.
- **Network blip mid-confirm**: confirm-socials API is idempotent — re-running deletes+upserts.
- **SPY-03 not yet shipped**: `runInitialAnalysis` is a stub that returns `{ ok: true, queued: false }`; the toast still fires "Initial analysis runs once SPY-03 ships." Guard with `if (typeof runInitialAnalysis === 'function')`.
- **User pastes invalid URL** ("not a url"): client-side Zod fails before fetch.
- **User pastes intranet URL** (e.g. `http://localhost`): Zod allows it; scraper times out; falls into `detection_failed=true` branch with message "Could not reach that URL."
- **TikTok URL with no handle** (e.g. video page): extract `@handle` from URL path via regex; if regex fails, fall back to fetching the page and parsing OG tags.
- **YouTube channel URL forms** (`/@handle`, `/channel/UC...`, `/c/name`): normalise via `lib/audit/scrape-youtube-profile.ts` resolver if it exists, else fall through to handle extraction.

## Test Plan

Unit (Vitest):
- `lib/prospects/url-classifier.test.ts`: 14 cases covering website, all four social platforms (TikTok/IG/YT/FB with handle + video forms), linktree, redirect-heavy, intranet, javascript:, mailto:, blank.
- `lib/prospects/detect-socials.test.ts`: stubbed scrape outputs, asserts the orchestrator returns the right `socials[]` shape with confidence tiers.
- `lib/prospects/onboard-from-url.test.ts`: full orchestrator using stubbed scrape + DB, asserts prospect row + touchpoint inserted, dedupe path returns `existed:true`.

Integration:
- `POST /api/prospects/onboard` with a real fixture HTML (cached in `tests/fixtures/onboard/`), asserts response shape + DB writes.
- `POST /api/prospects/[id]/confirm-socials` asserts upsert + analysis trigger fire.

E2E (Playwright):
- `tests/e2e/prospect-onboard.spec.ts`:
  - Paste a real brand URL (stubbed network), advance through confirm, land on detail page within 30s.
  - Paste a TikTok profile URL, confirm `primary_platform=tiktok` set.
  - Force a scrape failure (intercept request), see bare-save flow.

Manual QA:
- Run on 10 real brands across e-commerce, creator, B2B, restaurant. Record p50/p95 latency.
- Re-paste same URL, confirm dedupe.
- Cancel mid-detect, confirm no DB write.

## Architecture Wiring

- Reuses `lib/audit/scrape-website.ts`, `lib/audit/search-competitor-socials.ts`, `lib/audit/persist-scraped-images.ts` per CONTEXT.md "Existing libs."
- Mirrors confirm-platforms visual pattern from `components/audit/audit-report.tsx`. Don't copy the component; copy the rhythm.
- Writes to SPY-01 tables (`prospects`, `prospect_socials`, `prospect_touchpoints`). No schema changes.
- Triggers SPY-03 `runInitialAnalysis(prospectId)` from `lib/prospects/initial-analysis.ts`. If SPY-03 hasn't landed yet, the import returns a no-op stub.
- Admin sidebar entry from SPY-01 is the entry point; `+ New prospect` CTA on `/admin/prospects` page links here.
- Touchpoint pattern from SPY-01 (kind='state_change') reused for audit trail.

## Done When

- Migration 277 already applied (from SPY-01); no new migration this PRD.
- `/admin/prospects/new` renders and accepts URL.
- `POST /api/prospects/onboard` returns within p95 30s for 10 real brand URLs.
- Confirm-socials inline UI works for high + ambiguous + zero detection.
- SPY-03 fire path verified: when SPY-03 ships, `runInitialAnalysis` is called within 2s of confirm.
- Dedupe path returns existing record without dupes in DB.
- Bare-save path works on a forced scrape failure.
- Sidebar "+ New prospect" CTA on list view goes here.
- E2E covers happy + bare + dedupe.
- `npx tsc --noEmit` clean; `npm run lint` clean.
- progress.txt fully `[x]`.
