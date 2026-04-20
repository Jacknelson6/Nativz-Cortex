# Reporting / Analytics Passoff — 2026-04-20

Handoff doc for the Zernio analytics rebuild work. Session ran long; user
piled on ~15 UI-polish asks toward the end that weren't all shipped.
Next session should consolidate them into one disciplined polish commit.

---

## TL;DR — where we are

- **Data layer is solid and verified.** Every Zernio endpoint we hit is
  live and returning real data. 6,162 posts + 5,612 platform snapshots
  backfilled across 22 clients, back to 2025-04-21.
- **UI is in flux.** Most components were shipped but the user flagged a
  long list of polish issues in rapid succession. The analytics page is
  functional but not yet "nice and polished."
- **Uncommitted changes exist** — see _Uncommitted state_ below before
  doing anything else.

---

## What's already shipped (committed to `main`)

Commits, most recent first:

| Commit | Summary |
|---|---|
| [`4b7733e`](https://github.com/Jacknelson6/Nativz-Cortex/commit/4b7733e) | Fix silent IG-insights 404 (`instagram-account-insights` → `instagram/account-insights`); add demographics / best-time / Google Business UI + wrappers |
| [`987f979`](https://github.com/Jacknelson6/Nativz-Cortex/commit/987f979) | Full Zernio feature-parity UI mount — posting cadence heatmap, content decay, posting frequency, post details grid, workspace health panel |
| [`360cb13`](https://github.com/Jacknelson6/Nativz-Cortex/commit/360cb13) | API routes for content-decay / posting-frequency / workspace-health / post-details / cadence; summary route returns followerChart + platformBreakdown; TotalFollowersChart + PlatformBreakdownTable components |
| [`8d0689e`](https://github.com/Jacknelson6/Nativz-Cortex/commit/8d0689e) | 365-day historical backfill via paginated `/analytics` + `source=all`; bump lookback 120 → 365; drop `post_metrics_post_type_check` |
| [`4c14fa4`](https://github.com/Jacknelson6/Nativz-Cortex/commit/4c14fa4) | One-colour-per-platform metric cards; follower forward-fill; empty-state sections; per-profile sync helper |
| [`ed75e9d`](https://github.com/Jacknelson6/Nativz-Cortex/commit/ed75e9d) | Initial Zernio rebuild — per-metric sparkline grid, overlay markers on trend line, OAuth callback `/accounts` fallback |
| [`2492fe8`](https://github.com/Jacknelson6/Nativz-Cortex/commit/2492fe8) | Zernio wrappers (content-decay, posting-frequency, account-health, workspace-health, post-timeline) + LinkedIn as a platform |

**DB state (via Supabase MCP):**
- 5,612 `platform_snapshots` rows, 22 distinct clients, 73 platform-accounts
- 6,162 `post_metrics` rows (98% thumbnail coverage)
- 222 `platform_follower_daily` rows (Zernio real series)
- Migrations applied: `120_reporting_rebuild_zernio.sql` + unrecorded
  LinkedIn/GoogleBusiness platform-constraint relaxations + IG follower
  forward-fill SQL (surgical UPDATE, not a file migration).

---

## Outstanding user feedback (NOT yet shipped)

Priority-ordered from the user's rapid-fire sequence at end of session.
Every item below is still open:

1. **Finish Connection Health removal.** Mount removed from
   `components/analytics/analytics-landing.tsx`, but these files still
   exist and reference an endpoint that's been partly gutted:
   - `components/reporting/workspace-health-panel.tsx` — delete
   - `app/api/reporting/workspace-health/route.ts` — delete
   - `lib/posting/zernio.ts` — `getWorkspaceHealth()` was partially
     removed via `sed`; **verify the file compiles cleanly and the
     surrounding methods (`getPostTimeline`, `getContentDecay`,
     `getPostingFrequency`) survived the deletion.**
2. **Top performing posts → 9:16 thumbnails with larger metric text.**
   Currently `aspect-video` in `components/reporting/top-posts-view.tsx`.
   Change to `aspect-[9/16]` and bump the metric row font sizes from
   `text-[10px]` to `text-xs` or `text-sm`.
3. **Platform breakdown + Posting cadence side-by-side.** Currently
   stacked in `analytics-dashboard.tsx`. Wrap in
   `grid grid-cols-1 lg:grid-cols-2 gap-4`.
4. **Remove "Total followers over time" chart** (`TotalFollowersChart`).
   Looks flat + useless when all follower series are near-constant.
5. **Remove old "Growth over time" chart** (`GrowthChart`). Redundant
   with per-platform sparklines.
6. **Remove Content Performance Decay card** (`ContentDecayCard`).
7. **Remove Posting Frequency vs Engagement** (`PostingFrequencyChart`).
8. **Remove audience demographics from default flow.** User said "show
   platform metrics unless asked for audience breakdown." Demographics
   should be behind a toggle or dedicated sub-tab, not the main page.
9. **Best time heatmap unreadable.** `BestTimeHeatmap` has 8–9px labels
   and skips 2 of every 3 hour labels. Needs bigger cell height (e.g.
   h-4 min), every hour labeled in 24-col grid, bigger day labels.
10. **Platform logos look unpolished.** `components/reporting/platform-badge.tsx` —
    the text-only "in" for LinkedIn and "G" for Google Business are
    placeholders. Use the proper SVG marks (LinkedIn is easy via
    `components/integrations/` — add a `LinkedInMark` and
    `GoogleBusinessMark` alongside the existing ones).
11. **Post details grid → match `components/results/source-browser.tsx`
    UI and functionality.** That component already solves filterable
    sorted post grids with thumbnails; the reporting one should visually
    mirror it. See `SourceBrowser` + `SourceMentionCard` as references.
12. **Platform sparkline graphs: time-on-X, posts-as-markers.** The
    current `MetricSparklineCard` already does this (days on x-axis,
    post-publish dates as dots). User may just not have realized.
    Worth confirming interactively before "fixing."
13. **Hover tooltips bigger.** In `MetricSparklineCard` the tooltip font
    is `fontSize: 11`; bump to 13–14. Caption in post-hover is
    `line-clamp-3`; bump to `line-clamp-4` and widen max-width.
14. **All text bigger across the analytics page.** Blanket ask.
    Section headers currently `text-sm`/`text-base`; bump to
    `text-base`/`text-lg`. Metric labels `text-xs`/`text-[11px]`; bump
    to `text-sm`. Review every card.
15. **YT sparkline shows +295% deltas for 2-day series.** When the prior
    period has 0 and current has any value, `calcChange` returns 100%
    (or comparable). Suppress the trend chip when `prevTotal === 0 ||
    series.length < 4` so thin data doesn't produce misleading badges.
    See `buildMetricCard` + `MetricSparklineCard`.

---

## Uncommitted state at session end

`git status` at handoff time had these dirty files that are **my in-flight
work, NOT yet committed or typechecked as a unit**:

- `components/analytics/analytics-landing.tsx` — removed WorkspaceHealthPanel
  import + mount. Safe.
- `lib/posting/zernio.ts` — `getWorkspaceHealth` method deleted via
  `sed '/getWorkspaceHealth/,/^  }$/d'`. **SED IS BLUNT — verify no
  adjacent method was truncated.** Run `npx tsc --noEmit` first; if
  there are errors about missing braces or orphaned code in zernio.ts,
  restore from HEAD and re-delete by hand.
- Scripts from this arc (safe, but not committed yet):
  - `scripts/backfill-zernio-account-ids.ts`
  - `scripts/sync-reporting-all.ts`
  - `scripts/sync-reporting-test.ts`

**Before doing anything else next session:** `git diff` and either commit
these as a cleanup commit or revert and redo.

Also unrelated to this arc but showing in `git status` (belongs to other
parallel work — do NOT touch):
- Client settings restructure (deletions under `components/clients/`,
  new `components/clients/settings/`, new `app/admin/clients/[slug]/settings/*`)
- Moodboard / client overview page changes
- Accounting page moved under `app/admin/tools/`
- `TODO.md`, `scripts/test-scrapers.ts`, untracked `OpenCassava/`, `hyperframes-explainer/`

---

## Zernio data-layer reference (authoritative)

The **only reliable source for endpoint paths** is the OpenAPI YAML at:

```
curl -H "Authorization: Bearer $ZERNIO_API_KEY" \
  https://zernio.com/api/openapi -o /tmp/zernio-openapi.yaml
```

The `docs.zernio.com/llms.txt` file has **wrong paths** (hyphens instead
of slashes) and was the source of several silent 404 bugs this session.

### Endpoints we wrap + use

| Purpose | Path | Where |
|---|---|---|
| Daily aggregates per account | `GET /v1/analytics/daily-metrics` | `getDailyMetrics` → `sync.ts` |
| Follower stats + daily series | `GET /v1/accounts/follower-stats` | `getFollowerStats` → `sync.ts` |
| Per-post analytics (paginated) | `GET /v1/analytics` | `getPostAnalytics` → `sync.ts` |
| IG profile visits + reach | `GET /v1/analytics/instagram/account-insights` | `getInstagramInsights` (⚠ path has slash) |
| IG demographics | `GET /v1/analytics/instagram/demographics` | `getInstagramDemographics` |
| YT demographics | `GET /v1/analytics/youtube/demographics` | `getYoutubeDemographics` |
| YT per-video daily views | `GET /v1/analytics/youtube/daily-views` | `getYoutubeDailyViews` (needs videoId) |
| Content decay buckets | `GET /v1/analytics/content-decay` | `getContentDecay` (flagged for REMOVAL) |
| Posting frequency | `GET /v1/analytics/posting-frequency` | `getPostingFrequency` (flagged for REMOVAL) |
| Best-time-to-post | `GET /v1/analytics/best-time` | `getBestTime` |
| Post timeline | `GET /v1/analytics/post-timeline` | `getPostTimeline` (wrapper only, no UI) |
| GMB performance | `GET /v1/analytics/googlebusiness/performance` | `getGoogleBusinessPerformance` |
| GMB search keywords | `GET /v1/analytics/googlebusiness/search-keywords` | `getGoogleBusinessSearchKeywords` |
| Account health | `GET /v1/accounts/{id}/health` | `getAccountHealth` |
| Workspace health | `GET /v1/accounts/health` | `getWorkspaceHealth` (being REMOVED) |
| TikTok creator info | `GET /v1/accounts/{id}/tiktok/creator-info` | `getTikTokCreatorInfo` (⚠ slash path) |
| FB pages available | `GET /v1/accounts/{id}/facebook-page` | `getFacebookPages` (useful for ASAB FB diagnosis) |
| LinkedIn orgs | `GET /v1/accounts/{id}/linkedin-organizations` | `getLinkedInOrganizations` |
| LinkedIn post analytics | `GET /v1/accounts/{id}/linkedin-post-analytics?urn=…` | `getLinkedInPostAnalytics` |
| LinkedIn post reactions | `GET /v1/accounts/{id}/linkedin-post-reactions?urn=…` | `getLinkedInPostReactions` |
| Plan / limits | `GET /v1/usage-stats` | `getUsageStats` |

### Plan confirmed

`/v1/usage-stats` says we're on the **Accelerate** plan — analytics addon
fully unlocked. If any endpoint starts returning 402, it's a plan-tier
issue; if it returns HTML 404, it's a wrong path.

### Known data gap: All Shutters and Blinds Facebook

`externalPostCount: 0` on Zernio's side for ASAB's FB account. Every
other FB page in the workspace has >0 external posts. Token is valid,
permissions are granted (user confirmed via screenshot). Likely causes:

1. Wrong FB Page selected during OAuth. Use
   `GET /v1/accounts/{id}/facebook-page` to see available pages and
   which one is currently linked.
2. Zernio's one-shot external-post import fired before the page was
   correctly selected and didn't retry. Disconnect + reconnect in
   Zernio's dashboard is the likely fix.

Not a Cortex bug.

---

## Key files

```
lib/posting/zernio.ts                          # All Zernio API wrappers
lib/posting/types.ts                           # SocialPlatform type, FollowerStats, etc.
lib/reporting/sync.ts                          # syncClientReporting + syncSocialProfile + syncOneProfile
lib/types/reporting.ts                         # PlatformSummary, SummaryReport, MetricCard, etc.

app/api/reporting/summary/route.ts             # main summary — returns followerChart + platformBreakdown
app/api/reporting/sync/route.ts                # on-demand sync trigger
app/api/reporting/top-posts/route.ts           # pre-existing top-posts route
app/api/reporting/post-details/route.ts        # paginated + filterable posts
app/api/reporting/cadence/route.ts             # post-publish heatmap source
app/api/reporting/content-decay/route.ts       # DELETE PER USER FEEDBACK
app/api/reporting/posting-frequency/route.ts   # DELETE PER USER FEEDBACK
app/api/reporting/workspace-health/route.ts    # DELETE PER USER FEEDBACK
app/api/reporting/demographics/route.ts        # keep wrapper; surface on-demand only
app/api/reporting/best-time/route.ts
app/api/reporting/gmb/route.ts
app/api/reporting/tiktok-creator-info/route.ts
app/api/cron/sync-reporting/route.ts           # twice-daily cron

app/api/scheduler/connect/route.ts             # Zernio OAuth kickoff
app/api/scheduler/connect/callback/route.ts    # fixed /accounts fallback

components/reporting/analytics-dashboard.tsx   # main page — big rewrite needed
components/reporting/platform-section.tsx      # per-platform sparkline grid (done)
components/reporting/metric-sparkline-card.tsx # one metric card with overlay markers
components/reporting/platform-breakdown-table.tsx
components/reporting/posting-cadence-heatmap.tsx
components/reporting/top-posts-view.tsx        # needs 9:16 rework
components/reporting/best-time-heatmap.tsx     # needs readability rework
components/reporting/demographics-card.tsx     # keep but hide from default flow
components/reporting/google-business-card.tsx
components/reporting/post-details-grid.tsx     # rewrite to match source-browser.tsx
components/reporting/content-decay-card.tsx    # DELETE
components/reporting/posting-frequency-chart.tsx # DELETE
components/reporting/total-followers-chart.tsx # DELETE
components/reporting/workspace-health-panel.tsx # DELETE
components/reporting/growth-chart.tsx          # DELETE usage (component can stay)
components/reporting/platform-badge.tsx        # logos need polish for LI + GMB

components/results/source-browser.tsx          # pattern to copy for post details grid
components/results/source-mention-card.tsx     # pattern to copy for post cards

scripts/backfill-zernio-account-ids.ts         # uncommitted
scripts/sync-reporting-all.ts                  # uncommitted
scripts/sync-reporting-test.ts                 # uncommitted
```

---

## Lessons / gotchas

1. **Never trust `llms.txt`** — paths are hyphenated there but slashed
   in the live API. Authoritative source is the OpenAPI YAML at
   `https://zernio.com/api/openapi`.
2. **`/v1/posts` hides external posts** — it only shows Zernio-scheduled
   posts. External (natively-posted) posts come back via `/v1/analytics?source=external`.
3. **Zernio date-range max is 1 year**, page size 100. `getPostAnalytics`
   paginates up to 20 pages = 2,000 posts/account.
4. **Follower series is thin** — often only the last 3 days. Forward-fill
   from the oldest series point or the current count. See `sync.ts` for
   the pattern; there's also a surgical SQL backfill we ran once.
5. **`dailyMetrics.length === 0`** for accounts that haven't posted
   recently — sync falls back to a single-day marker snapshot with just
   followers. Summary route now also stubs out sections for any
   connected profile with no window activity.
6. **Our OAuth callback silently dropped `late_account_id`** before the
   fix in `ed75e9d`. If a new integration ever appears disconnected in
   our DB but works in Zernio's dashboard, run
   `npx tsx scripts/backfill-zernio-account-ids.ts`.
7. **On-demand sync is one admin click away.** Button exists in the
   analytics header (`Sync now`). A `syncOneProfile(profileId)` helper
   exists in `lib/reporting/sync.ts` for targeted per-platform reruns;
   it's not yet wired to a UI button.
8. **Cron runs twice daily** at 6 AM and 2 PM UTC
   (`/api/cron/sync-reporting` in `vercel.json`). Syncs all clients
   with Zernio-connected profiles; 90-day backfill on first sync, 7-day
   on subsequent runs. Now that the data layer is healthy the cron is
   the steady-state path; the one-shot scripts are only for emergencies.

---

## Suggested first moves next session

1. `git status` + `git diff` to see the in-flight mess.
2. `npx tsc --noEmit` — if zernio.ts errors, restore:
   ```bash
   git checkout HEAD -- lib/posting/zernio.ts
   ```
   then cleanly remove `getWorkspaceHealth` with an Edit tool instead
   of `sed`.
3. Delete the four "remove" files (workspace-health / content-decay /
   posting-frequency / total-followers / workspace-health API route /
   content-decay API route / posting-frequency API route).
4. Remove the four component imports + mounts from
   `components/reporting/analytics-dashboard.tsx`.
5. Move `PlatformBreakdownTable` + `PostingCadenceHeatmap` into a
   `grid-cols-2` wrapper.
6. Rewrite `top-posts-view.tsx` for 9:16 aspect + larger metrics.
7. Rewrite `best-time-heatmap.tsx` for readability (all 24 hour labels,
   bigger cells ~`h-4 w-4`, bigger day labels).
8. Fix `metric-sparkline-card.tsx` hover tooltip — bump font-size, fix
   thin-data delta suppression (`hide when prev === 0 && series.length < 4`).
9. Polish `platform-badge.tsx` LinkedIn + GoogleBusiness with real SVG
   marks matching the other platform marks in `components/integrations/`.
10. Rewrite `post-details-grid.tsx` to mirror `source-browser.tsx` —
    same card shape, same filter toolbar, same sort dropdown, same
    "show more / show all" pattern. Lift `SourceMentionCard` styles.
11. Blanket text-size pass — grep the reporting components for
    `text-xs`, `text-[10px]`, `text-[11px]`, `fontSize: 10`,
    `fontSize: 11` and bump up by one step.
12. Build (`npm run build`) + commit + push.

Expect one monolithic "feat(analytics): polish pass" commit — don't try
to chunk it into 10 small commits during the cleanup; the session that
spawned this doc did that and the feedback piled up faster than the
commits shipped.
