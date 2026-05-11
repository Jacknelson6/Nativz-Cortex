# PRD: SPY · 06 · Recurring competitor monitor (durable weekly runs)

> Spying → Prospect Pipeline · 06/10 · 2026-05-10

## Purpose & Value

The one-time benchmark from SPY-05 is a sales tool; this PRD turns it into a relationship. Scheduled weekly competitor scrapes per prospect feed a delta detector that surfaces "competitor X gained 12k followers" and "competitor Y posted a viral video" alerts. Sales reps get a non-pushy reason to reach back out; prospects feel the agency working on their behalf before they've paid. This is the one PRD in the series that legitimately uses Vercel Workflow DevKit for durable scheduled execution.

## Problem

Prospects go cold 14 days after a first call. We have no automated touchpoint mechanism beyond manual sales rep effort. SPY-05 gives us the scrape pipeline; we need to schedule it, detect deltas week-over-week, and surface the meaningful ones without flooding the team.

## Primary User

Sales rep (consumes alerts; uses them as conversation re-openers). Strategist (curates monitor scheduling per prospect).

## SMART Goals

- Cron / Workflow reliably fires weekly per active monitor; success rate ≥ 99% over 4 consecutive weeks.
- Delta detection latency: alert surfaces in admin UI within 1 hour of scrape completion.
- False-positive rate ≤ 40% (alerts judged "worth surfacing" by strategist).
- Cost per prospect per month ≤ $2 (4 weekly runs × ≤$0.50).
- Push notification fires on every `severity='high'` alert.

## User Stories

- **US-01** — As a strategist, I can toggle "Monitor weekly" on a prospect record and pick day-of-week + frequency.
- **US-02** — As a sales rep, the prospect detail "Monitor" tab shows a feed of timestamped alerts: "Competitor X gained 12k followers this week", "Competitor Y posted a viral video (380k views)".
- **US-03** — As an admin, I can pause or cancel a monitor without losing history.
- **US-04** — As a system, when a high-severity alert fires, I push-notify `owner_user_id`.
- **US-05** — As a sales rep, I can filter alerts by severity / kind / time range across all monitored prospects in `/admin/prospects/alerts`.
- **US-06** — As a system, when SPY-07 conversion fires, monitors auto-pause by default.

## In Scope

- Migration `281_prospect_monitor.sql`: 3 tables (`prospect_monitor_config`, `prospect_monitor_snapshots`, `prospect_monitor_alerts`).
- Workflow DevKit `DurableAgent` per active monitor (or a single weekly cron that scans configs — see D-01).
- Per-week scrape orchestrator: reuses SPY-05's grade-competitor pipeline.
- Delta detector with 4 alert kinds (follower_jump, viral_post, cadence_shift, format_pivot).
- UI: prospect detail "Monitor" tab + global `/admin/prospects/alerts` feed.
- Push notification integration.
- Auto-pause on SPY-07 conversion (handled there by setting `active=false`; SPY-06 just respects the flag).

## Out of Scope

- LLM-narrated alerts ("here's why this matters") — v2.
- Sentiment shift alerts — v2.
- Cross-prospect industry-trend rollups.
- Alert email digests (SPY-10 owns that, consuming this PRD's `prospect_monitor_alerts`).
- Per-competitor alert toggles inside one prospect.
- Re-scraping the prospect themselves (competitors only).

## Resolved Decisions

- **D-01** — Workflow DevKit DurableAgent per monitor, or a single weekly cron that scans `prospect_monitor_config`? **→ Single weekly cron at `app/api/cron/prospect-monitor-weekly/route.ts` PLUS one Workflow DevKit `DurableAgent` per individual run.** Rationale: cron is simple and works for the "wake up Monday" trigger; per-run DurableAgent gives durability for the actual scrape sequence (which is multi-stage and can crash mid-run). Best of both. (We do NOT need a long-running scheduled agent per prospect; that's over-engineering.)
- **D-02** — Frequency options? **→ Weekly + biweekly v1. No daily until post-conversion.** Rationale: cost; weekly is enough signal at sales stage.
- **D-03** — Severity threshold tuning UI or env-only? **→ Env-only v1.** Rationale: not enough data to know defaults; revisit at v2 once 4 weeks of alerts exist.
- **D-04** — Alert kinds? **→ Four: `follower_jump`, `viral_post`, `cadence_shift`, `format_pivot`.** Rationale: deterministic, derivable from snapshot data.
- **D-05** — Re-scrape prospect alongside competitors? **→ No, competitors only.** Rationale: prospect is static until conversion.
- **D-06** — Snapshot retention? **→ Keep all snapshots forever; rely on partitioning if it ever gets large.** Rationale: cheap, history compounds in value.
- **D-07** — Day-of-week control? **→ Strategist picks a single integer 0-6 (Sunday-Saturday). Cron scans configs whose `day_of_week=<today>` and `active=true`.** Rationale: simple, distributes load across the week.
- **D-08** — What handle scope? **→ Re-use the competitors from the latest succeeded `prospect_competitor_benchmarks`.** Rationale: don't make the strategist re-pick; benchmark is the source of truth.
- **D-09** — If no benchmark exists, can monitor still toggle on? **→ Yes, but it queues a "needs benchmark" state and emits a warning toast at toggle time.** Rationale: don't block the UX; strategist may benchmark later.
- **D-10** — Push notification format? **→ Single concatenated body for all high-severity alerts in one run, max 280 chars. Uses existing `PushNotification` flow.** Rationale: don't ping-spam.
- **D-11** — Workflow DevKit dependency. **→ Use `@vercel/workflow` (latest stable). Single workflow definition `lib/workflows/prospect-monitor-run.ts`. Triggered by the weekly cron. Resumes on crash.** Rationale: this is the exact substrate Workflow DevKit is for; the workflow has 4 to 6 stages with retry-friendly contracts.
- **D-12** — Cron schedule entry? **→ `vercel.json` cron `0 9 * * 0` (Sun 9am UTC) entry firing the weekly route; the route loops monitors due *today* (Sun-Sat distribution).** Rationale: cron fires daily would be cheaper but Vercel cron resolution is fine at daily; using daily lets per-monitor day_of_week filter.
- **D-13** — Daily cron actually? **→ Yes, change D-12: `0 9 * * *` daily; route filters by `day_of_week=<today>`.** Rationale: prevents the Monday backlog spike.

## Data Model

### Migration `281_prospect_monitor.sql`

```sql
-- ============================================================
-- SPY-06: Prospect recurring competitor monitor
-- 3 tables: config, snapshots, alerts.
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_monitor_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL UNIQUE REFERENCES prospects(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'weekly'
    CHECK (frequency IN ('weekly','biweekly')),
  day_of_week INTEGER NOT NULL DEFAULT 1 CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun
  active BOOLEAN NOT NULL DEFAULT true,
  paused_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pm_config_active_dow
  ON prospect_monitor_config(day_of_week) WHERE active = true;

CREATE TABLE IF NOT EXISTS prospect_monitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  competitor_handle TEXT NOT NULL,
  competitor_platform TEXT NOT NULL CHECK (competitor_platform IN ('tiktok','instagram','youtube','facebook')),
  -- Raw metrics blob: { followers_count, posts_last_7d, top_post: { id, views, published_at }, ... }
  raw_metrics JSONB NOT NULL,
  workflow_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pms_prospect_time
  ON prospect_monitor_snapshots(prospect_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_pms_prospect_competitor_time
  ON prospect_monitor_snapshots(prospect_id, competitor_platform, competitor_handle, captured_at DESC);

CREATE TABLE IF NOT EXISTS prospect_monitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES prospect_monitor_snapshots(id) ON DELETE SET NULL,
  prior_snapshot_id UUID REFERENCES prospect_monitor_snapshots(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('follower_jump','viral_post','cadence_shift','format_pivot')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  message TEXT NOT NULL,                              -- human-readable, no em dash
  evidence JSONB DEFAULT '{}'::jsonb,                 -- numbers backing the message
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pma_prospect_time
  ON prospect_monitor_alerts(prospect_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pma_unack
  ON prospect_monitor_alerts(occurred_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pma_severity
  ON prospect_monitor_alerts(severity, occurred_at DESC);

CREATE TRIGGER trg_pm_config_updated
  BEFORE UPDATE ON prospect_monitor_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: admin only
ALTER TABLE prospect_monitor_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_monitor_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_monitor_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY pmc_admin_all ON prospect_monitor_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
CREATE POLICY pms_admin_all ON prospect_monitor_snapshots
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
CREATE POLICY pma_admin_all ON prospect_monitor_alerts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
```

## API Contracts

### `POST /api/prospects/[id]/monitor`

Auth: admin.

Request:
```ts
const RequestSchema = z.object({
  active: z.boolean(),
  frequency: z.enum(['weekly','biweekly']).default('weekly'),
  day_of_week: z.number().int().min(0).max(6).default(1),
});
```

Behaviour: upsert into `prospect_monitor_config` for this prospect; if `active=false`, set `paused_at = now()`.

Response (200): `{ config: ProspectMonitorConfigRow }`.

### `GET /api/prospects/[id]/monitor`

Auth: admin.

Response (200):
```ts
{
  config: ProspectMonitorConfigRow | null;
  recent_snapshots: ProspectMonitorSnapshotRow[];   // last 10, ordered captured_at DESC
  recent_alerts: ProspectMonitorAlertRow[];          // last 50
}
```

### `POST /api/prospects/[id]/monitor/run-now`

Auth: admin.

Behaviour: trigger an ad-hoc run via the same workflow, bypassing day_of_week check. Rate-limit 1/12h.

Response (200): `{ workflow_run_id: string }`.

### `POST /api/prospects/[id]/monitor/alerts/[alert_id]/ack`

Auth: admin.

Behaviour: sets `acknowledged_at = now()`, `acknowledged_by = auth.uid()`.

Response (200): `{ ok: true }`.

### `GET /api/prospects/alerts`

Auth: admin.

Query:
```ts
const QuerySchema = z.object({
  severity: z.enum(['low','medium','high']).optional(),
  kind: z.enum(['follower_jump','viral_post','cadence_shift','format_pivot']).optional(),
  acknowledged: z.enum(['true','false']).optional(),
  since: z.string().datetime().optional(),
  prospect_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
```

Response (200):
```ts
{
  alerts: Array<ProspectMonitorAlertRow & { prospect: { id; brand_name } }>;
}
```

### `GET /api/cron/prospect-monitor-daily`

Auth: cron secret (`Authorization: Bearer ${CRON_SECRET}`).

Route config: `export const maxDuration = 300;`

Behaviour:
1. Compute today's day_of_week.
2. SELECT configs where `active=true AND day_of_week=<today>`.
3. For biweekly configs, additional check: `last_run_at` is null OR ≥ 13 days ago.
4. For each due config: trigger the `prospectMonitorRun` Workflow DevKit DurableAgent run (do not await; fan-out).
5. Returns `{ triggered: number; skipped: number }`.

Errors: 401 missing/wrong CRON_SECRET; 500 with `{ error }`.

## LLM Prompts

None. Delta detection is deterministic.

### Delta detection rules (in `lib/prospects/delta-rules.ts`)

| Alert kind | Condition (week-over-week, comparing latest snapshot vs prior for same competitor) | Severity |
|---|---|---|
| follower_jump | `followers_count_delta_pct >= 10%` (and absolute >= 500) | high if ≥ 25%; medium if ≥ 10%; low otherwise |
| viral_post | top-1 post `views` ≥ 5× competitor's trailing-30d avg | high if ≥ 10×; medium if ≥ 5×; low if ≥ 3× |
| cadence_shift | `posts_last_7d` changes ≥ 50% vs prior week | medium if ≥ 50%; high if competitor went from 0 to ≥5 |
| format_pivot | ≥ 3 of last 5 posts are a new archetype not seen in prior 5 | medium |

Severity thresholds live as constants in `lib/prospects/delta-rules.ts`, easily tuned.

## Workflow DevKit

### `lib/workflows/prospect-monitor-run.ts`

DurableAgent that runs one monitor cycle for one prospect.

Steps:
1. **Load context** — fetch prospect, latest succeeded benchmark, list of competitors from benchmark's `competitors` JSON.
2. **For each competitor (parallel, max 3)** — scrape via `lib/audit/scrape-<platform>-profile.ts`; insert `prospect_monitor_snapshots` row.
3. **Detect deltas** — for each new snapshot, fetch prior snapshot for same `(prospect_id, competitor_platform, competitor_handle)`, apply rules, INSERT alerts.
4. **Update config** — `last_run_at`, `last_success_at` on success; `last_error` on failure.
5. **Notify** — if any alerts have `severity='high'`, fire `PushNotification` to `prospects.owner_user_id` with concatenated body.

Each step is a Workflow step with retry policy; the DurableAgent persists progress so a crash mid-step resumes cleanly.

Workflow signature:
```ts
import { defineWorkflow } from '@vercel/workflow';

export const prospectMonitorRun = defineWorkflow({
  id: 'prospect-monitor-run',
  input: z.object({ prospect_id: z.string().uuid(), config_id: z.string().uuid() }),
  // Step retry config: 3 attempts with exponential backoff on Apify failures.
});
```

(Exact API may vary with Workflow DevKit version; the implementation task verifies against the installed dependency before writing.)

## UI Components

### `app/admin/prospects/[id]/page.tsx` (modify)

Add "Monitor" tab to the tab list (activates the previously-stubbed slot or adds new).

### `components/prospects/monitor-config-card.tsx`

Client. Shows current config + form to toggle.

Props: `{ prospectId; initialConfig: ProspectMonitorConfigRow | null }`.

Layout:
- Toggle "Monitor weekly" (left).
- Frequency select: Weekly / Biweekly.
- Day-of-week select: Sun-Sat.
- Save button.
- Status row: "Last run {relative} · {success | error}".
- "Run now" button (calls `/run-now`; rate-limit-aware tooltip).

Copy:
- Section title: "Recurring monitor"
- Toggle label: "Watch competitors weekly"
- Save button: "Save monitor"
- Run-now button: "Run now"
- Rate-limit tooltip: "Run available in {time_remaining}"

### `components/prospects/alert-feed.tsx`

Server-renderable. Shows last 50 alerts for this prospect. Each row: severity dot, kind icon (`TrendingUp` / `Flame` / `Activity` / `Shuffle`), message, relative time, ack button.

### `app/admin/prospects/alerts/page.tsx`

Global alert feed across all prospects. Filters by severity / kind / acknowledged. Server component with searchParams.

Layout:
- Header: "Alerts" + filter pills.
- Table: prospect (link) | kind | message | severity dot | occurred at | ack action.

### `components/prospects/alert-row.tsx`

Server-renderable row component shared between detail-tab feed and global feed.

### `components/layout/admin-sidebar.tsx` (modify)

Add "Alerts" entry under Intelligence (below "Prospects"). Badge = count of unacknowledged high-severity alerts.

## File Map

Create:
- `supabase/migrations/281_prospect_monitor.sql`
- `lib/prospects/delta-rules.ts`
- `lib/prospects/delta-rules.test.ts`
- `lib/prospects/monitor-orchestrator.ts` — the non-workflow code path (called by the workflow steps)
- `lib/prospects/monitor-orchestrator.test.ts`
- `lib/workflows/prospect-monitor-run.ts` — Workflow DevKit definition
- `lib/workflows/index.ts` — registry export
- `app/api/prospects/[id]/monitor/route.ts` (POST + GET)
- `app/api/prospects/[id]/monitor/run-now/route.ts`
- `app/api/prospects/[id]/monitor/alerts/[alert_id]/ack/route.ts`
- `app/api/prospects/alerts/route.ts`
- `app/api/cron/prospect-monitor-daily/route.ts`
- `app/admin/prospects/alerts/page.tsx`
- `components/prospects/monitor-config-card.tsx`
- `components/prospects/alert-feed.tsx`
- `components/prospects/alert-row.tsx`
- `tasks/ralph/spy-06-recurring-monitor/progress.txt`

Modify:
- `lib/prospects/types.ts` — add `ProspectMonitorConfigRow`, `ProspectMonitorSnapshotRow`, `ProspectMonitorAlertRow`, `AlertKind`, `AlertSeverity`.
- `lib/supabase/types.ts` (regen)
- `app/admin/prospects/[id]/page.tsx` — mount Monitor tab.
- `components/layout/admin-sidebar.tsx` — add "Alerts" entry.
- `vercel.json` — add cron entry for `/api/cron/prospect-monitor-daily`.
- `package.json` — add `@vercel/workflow` dependency.
- `.env.example` — document new vars if Workflow DevKit needs any (verify).
- `app/api/prospects/[id]/convert/route.ts` (SPY-07) — sets `prospect_monitor_config.active=false` on conversion (cross-PRD wiring; SPY-07 owns implementation, this PRD documents expectation).

## Env Vars

New: depends on Workflow DevKit packaging. Verify at install. Likely none beyond `CRON_SECRET` reuse.

Reuses: `CRON_SECRET`, `APIFY_TOKEN`.

## Edge Cases

- **No succeeded benchmark exists** when monitor toggles on. Config saves but cron skips this prospect with `last_error='No benchmark; pick competitors first'`. Toast surfaces this.
- **Benchmark competitor list is empty (all failed in SPY-05).** Same as above.
- **Scrape failure for one competitor.** Continue with others; mark partial; do not write snapshot for failing one; do not emit alerts for it.
- **All 3 scrapes fail.** Workflow marks failure; `last_error` set; no alerts; cron retries next week.
- **First-ever run** (no prior snapshot). Insert snapshot; no deltas; no alerts.
- **Competitor renamed handle / private.** Detected as scrape failure; admin gets a `last_error` note; strategist should re-benchmark.
- **Duplicate cron fire** (Vercel cron retry). Workflow DurableAgent's idempotency keys prevent dupe snapshots within same calendar day for same `(prospect_id, competitor)`.
- **Workflow crashes mid-run.** Workflow resumes from last completed step.
- **High-severity alerts piled up over 7 days unacknowledged.** Sidebar badge shows count; no email digest (SPY-10 handles digesting).
- **Conversion fires while monitor is mid-run.** Run completes; SPY-07 sets `active=false` so next week's cron skips.
- **`prospect.owner_user_id` is null.** Skip push notification; alert still writes to DB.
- **Rate-limit force on run-now.** Admin secret query param or env-gated; not in v1 UI.
- **Severity threshold misclassifies.** Tweak `lib/prospects/delta-rules.ts` constants; no DB schema change required.
- **Acknowledge after archive.** Allowed; doesn't error.

## Test Plan

Unit (Vitest):
- `lib/prospects/delta-rules.test.ts`: 4 alert kinds × 3 severities × NA cases. ~20 cases.
- `lib/prospects/monitor-orchestrator.test.ts`: 3 happy + 2 partial-fail + 1 first-run + 1 dupe-day cases.

Integration:
- `POST /api/prospects/[id]/monitor`: upsert, toggle off sets paused_at.
- `GET /api/cron/prospect-monitor-daily` with `CRON_SECRET`: triggers expected configs.
- Run an end-to-end workflow against fixtures: snapshots + alerts inserted.

E2E (Playwright):
- Toggle monitor on prospect detail.
- Force a run-now, observe alerts appearing within polling window.
- Ack alert; disappears from "unacknowledged" view.
- Global `/admin/prospects/alerts` filters work.

Manual QA:
- Real run for 5 prospects over 2 consecutive weeks. Verify ≥ 99% success rate, false-positive rate ≤ 40%.
- Verify push notification fires on high-severity.

## Architecture Wiring

- Reuses SPY-05's competitor list from `prospect_competitor_benchmarks` (most recent succeeded).
- Reuses `lib/audit/scrape-<platform>-profile.ts` scrapers.
- New Workflow DevKit definition lives under `lib/workflows/` — first such file in the repo; verify `package.json` does not yet depend on `@vercel/workflow`.
- Daily cron at `app/api/cron/prospect-monitor-daily/route.ts` follows existing cron pattern in `app/api/cron/` (auth header, `withCronTelemetry` if available).
- Sidebar Alerts entry mirrors SPY-01 Prospects entry pattern.
- SPY-07 conversion explicitly disables monitor (cross-PRD wiring described in SPY-07).
- SPY-10 digest reads from `prospect_monitor_alerts` for the weekly competitor digest section.

## Done When

- Migration 281 applied; 3 tables + indexes + RLS.
- Workflow DevKit dependency installed; `prospectMonitorRun` workflow definition compiles.
- Cron route registered in `vercel.json` and verified firing daily.
- Toggle monitor on prospect detail works; config persists.
- Manual `run-now` triggers a full cycle, snapshot + (if delta) alert rows appear.
- Delta detection produces expected outputs against fixtures.
- Push notification fires on high-severity alert (verified manually).
- 2 consecutive weeks of cron runs succeed ≥ 99% (during stabilisation window).
- Global `/admin/prospects/alerts` page filters work.
- Sidebar "Alerts" entry with unack count.
- `npx tsc --noEmit` clean; `npm run lint` clean.
- progress.txt fully `[x]`.
