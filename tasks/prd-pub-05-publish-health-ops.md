# PRD PUB-05: Publish Health Ops Dashboard + Morning Digest

## Purpose & value

Pull everything PUB-01 through PUB-04 surfaces into one glanceable admin view + one morning digest. Jack opens the page once a week (or when a chat ping happens) and gets the whole picture; the digest lands in his inbox every morning so he doesn't have to.

## Problem

Right now publish health is scattered across:
- Per-post `scheduled_post_platforms.status` (the calendar view)
- Per-client `social_profiles.token_status` (Connections matrix)
- Per-incident Google Chat cards (Ops Chat)
- Per-day audit cards (PUB-03 once shipped)
- Per-platform canary status (PUB-04 once shipped)

There's no place to see all of it at once: pipeline health, per-platform success rate over time, top failing clients, canary trend.

## Primary user

Jack. One page for whole-pipeline situational awareness.

## SMART goals

- Page loads in <1.5s with rolling 30d data
- 4 widgets cover 90% of "what's broken right now" questions: success rate per platform, top failing clients, canary trend, last 24h failure list
- Morning digest email lands at 7am ET, ≤500 words, ≤5 bullets

## User story

> As Jack, when I want to know if the pipeline is healthy this week, I open `/admin/ops/publish-health` and see four widgets. If something's red, I click to triage. I don't have to ask Slack, dig through Supabase, or open three different admin pages.

## In scope

### Dashboard `/admin/ops/publish-health`

- **Widget 1: Per-platform success rate** — Rolling 7d / 30d toggle. Stacked bars: published / partial / failed per day per platform. Hover reveals counts.
- **Widget 2: Top failing clients** — Last 7d, ranked by miss count, click-through to client's calendar.
- **Widget 3: Canary trend** — From PUB-04. 30-day strip per platform: green dot = canary passed, red = failed. Click red dot for the error.
- **Widget 4: Last 24h failures table** — Per-leg failures with: client name, platform, time, reason, retry button.
- Sticky header with one big "All systems healthy / N legs degraded" banner.

### Morning digest

- Email to Jack@nativz.io, 7am ET (cron `0 12 * * *` UTC).
- Subject: `Cortex publish health: <date> — <status>` where status is `all clean` / `N misses` / `pipeline degraded` (canary failed in last 24h).
- Body: PUB-03 audit summary + canary status + top 3 failing clients + link to dashboard.
- Plain HTML email matching `docs/email-style.md`. No promotional. No CC/BCC anyone else.

## Out of scope

- Per-client digest — internal only, this is for Jack's eyes.
- Real-time websocket updates — page polls on focus, fine.
- Forecasting / ML — last 30d view is enough.

## Architecture wiring

- New page `app/admin/ops/publish-health/page.tsx` (server component, fetches initial data; client widgets for hover/interaction).
- Read-only queries against:
  - `scheduled_post_platforms` (success/fail trends)
  - `social_profiles` (token health snapshot)
  - `synthetic_publish_canaries` (PUB-04 trend)
- New API route `app/api/admin/publish-health/route.ts` for client refresh.
- Daily digest cron `app/api/cron/publish-health-digest/route.ts`, runs `0 12 * * *` UTC.
- Email sender added to `lib/email/resend.ts`: `sendPublishHealthDigest({ digest, agency: 'nativz' })`. Always nativz brand (Jack's internal-tool email).
- Reuses `IconCard` + `SectionPanel` from existing design system (per Jack's project memory).
- Charts via Recharts, `'use client'` per project convention.

## Open questions

- Should the dashboard be visible to other admins, or Jack-only? Default: any admin (no permission gate beyond admin check).
- Email digest format: plain summary vs full per-incident table? Default: plain summary in body, link out to dashboard for detail.

## Assumptions

- Recharts handles 30d × 4 platforms without performance issues (it does; same volume as analytics widgets).
- Querying `scheduled_post_platforms` for a 30d window is fast enough without dedicated aggregation tables (verify with `EXPLAIN ANALYZE` on first build; add a materialized view if >500ms).

## Done when

- `/admin/ops/publish-health` page renders the 4 widgets with real data.
- Sidebar entry in `/admin` nav under a new "Ops" group (or "Manage" if Jack prefers — confirm during build, default Manage).
- Morning digest email arrives at 7am ET with correct status.
- Re-running the digest cron the same day is idempotent (dedup via `cron_runs` row).
- Typecheck + lint clean. Committed on main.
