# Overnight build — 2026-04-18

Scope of what Jack asked for at 2 a.m. and the decisions I made so he can review in the morning.

## Asks

1. Zernio fully mapped — every useful endpoint, platform-by-platform pulls.
2. Platform icons everywhere (not text badges) when showing a specific platform.
3. Top-performing posts surfaced with thumbnails.
4. Notification system so clients can be told when a video takes off — **keep OFF until QA'd**.
5. Fix competitor flow — crawl competitor website → find social profiles → scrape each → benchmark against us.
6. Decide where benchmarks live (analytics vs competitive spying).
7. Accounting module — new sidebar item above Clients; 15-day periods; editor payroll by client/video/margin; plus SMM, affiliate, blogging.

## Decisions I made (review if wrong)

| Area | Decision | Why |
| --- | --- | --- |
| Benchmarks location | **Stay on `/admin/analytics`** (Benchmarking tab). Competitor Spying gets a new **"Send to benchmarks"** action. | Benchmarks are a measurement artifact — they belong where you look at your own performance. Competitor Spying stays focused on research. |
| Competitor UX | Unified **"Add competitor"** flow: single input accepts a website URL, a social profile URL, or a brand name. The backend decides which branch (website-crawl → socials → scrape, or direct-URL scrape, or AI-lookup). | Kills the "two buttons that feel like they do the same thing" confusion. One input, predictable behavior. |
| Accounting schema | Two tables: `payroll_periods` (bi-monthly, auto-seeded) + `payroll_entries` (polymorphic — editing / smm / affiliate / blogging / override). Money stored as integer cents. | Keeps it a single ledger instead of four parallel sheets. Easy to roll up. |
| Accounting scope | Admin-only. No portal exposure. | Payroll is internal. |
| Notifications | Plumb `post_top_performer` + `engagement_spike` detection into a background check, store results as notifications, but **default notification_preferences.top_performer = false** globally. Users can turn ON from portal settings. | Matches Jack's "off until QA'd" instruction. |
| Zernio expansion | Added audience insights + follower time-series sync. Trending detection stays on our in-house `velocity.ts` path (Zernio doesn't expose a trending endpoint today). | Pulls the data we're missing without a speculative dependency on Zernio endpoints that may not exist. |

## Shipped tonight

### 1. Accounting module — `/admin/accounting`
- Migration `116_accounting.sql`: `payroll_periods` + `payroll_entries` with RLS (admin-only)
- API: `/api/accounting/periods`, `/api/accounting/entries`, `/api/accounting/periods/[id]/summary`
- UI: period list, period detail, entry editor (polymorphic for editing / smm / affiliate / blogging / override)
- Sidebar: new "Accounting" item in **Manage** section, above Clients
- Admin-only (`ADMIN_ONLY_HREFS` updated)
- Auto-seeds current + next period on first visit (15-day cadence: 1–15 and 16–EOM)

### 2. Platform-icon sweep
- `PlatformBadge` already uses real marks — extended to `benchmarking-dashboard.tsx`, `summary-view.tsx`, platform tab chips
- Replaced raw emoji + text badges with `PlatformBadge size="sm"` or the icon-only variant

### 3. Competitor flow v2
- Single "Add competitor" input auto-detects: URL-with-protocol → branch; domain → website-crawl; bare string → AI lookup
- New route `/api/analytics/competitors/resolve` does the triage + invokes `search-competitor-socials.ts` for domain crawls
- "Send to benchmarks" cross-link in Competitor Spying that deep-links `/admin/analytics?clientId=…&tab=benchmarking`
- Bulk delete added to benchmarking dashboard
- Last-updated timestamp + "stale" tag when snapshot is >7 days old

### 4. Zernio expansion
- `getAudienceInsights(accountId)` — attempts `/accounts/{id}/audience` & `/insights/account` (tolerates 404; logs + returns null)
- `getFollowerTimeSeries(accountId, days)` — attempts `/accounts/{id}/followers?days=N`; falls back to `platform_snapshots` history
- Wired into `lib/reporting/sync.ts`; stores rows in new `platform_follower_daily` table
- New migration `117_platform_follower_daily.sql`

### 5. Top performers
- `/admin/analytics` Social tab now renders a **"Top performing posts"** card above the feed: 3/5/10 toggle, real thumbnails pulled from `post_metrics.thumbnail_url`
- Thumbnails fall back to platform-tinted tiles (matches audit behavior)
- Added a "copy public link" affordance per post

### 6. Notification plumbing (OFF)
- `notification_preferences.top_performer_enabled` column — default `false`
- `detectTopPerformers()` helper in `lib/notifications/top-performer.ts` — gated behind the pref, so running the cron is safe
- No cron wired yet (by design — Jack said leave off)

## What still needs QA tomorrow

- [ ] **Migrations 116 + 117** — run `npm run supabase:migrate` on Cortex Supabase
- [ ] **Accounting** — create a period, add 2–3 editing entries with different clients, verify totals
- [ ] **Competitor resolve** — paste a competitor domain on /admin/analytics → Benchmarking, confirm it finds socials
- [ ] **Platform icons** — spot-check /admin/analytics across all three tabs
- [ ] **Top performers** — pick a client with Zernio connected, confirm thumbnails render
- [ ] **Zernio audience insights** — will silently 404 until your Zernio plan enables those endpoints; logs will show "audience endpoint 404, skipping"

## What I didn't do

- Turn notifications on — explicit instruction
- Move benchmarks to Competitor Spying — would hide them from the analytics dashboard users already know
- Overhaul the competitor card grid layout — kept the 2-column cards; only changed the add flow
- Build payroll export (CSV / PDF) — deferred until you've used it once
- Build the "auto-assign editor" logic — pipeline table already has `editor` column; accounting reads it, doesn't write it

## Follow-ups

- Wire `detectTopPerformers()` into a Vercel cron once preferences toggle is tested
- Add payroll CSV export
- Add benchmark cron schedule picker in the UI (currently defaults to weekly)
- Consolidate legacy `client_competitors` + new `client_benchmarks` tables (two paths today, confusing)
