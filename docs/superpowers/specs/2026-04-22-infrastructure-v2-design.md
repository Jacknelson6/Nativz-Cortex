# Infrastructure v2 — observability surface

**Date:** 2026-04-22
**Status:** approved (Jack, sight-unseen autonomous run)
**Linear:** extends NAT-5 (admin tools consolidation)

## TL;DR

Today's `/admin/infrastructure/page.tsx` is a single-purpose dashboard for the topic-search LLM pipeline. This spec turns it into the unified **Platform observability** surface modeled after the RankPrompt Health / Infrastructure / Adoption pages Jack referenced: tabbed layout, KPI tile strip on every tab, drill-down cards below. No new backend plumbing for MVP — every tab reads from data we already persist.

## Goals

1. **One page, many subsystems.** A Nativz admin opens Infrastructure and sees the health of every system Cortex runs on: the topic-search pipeline, AI providers, cron jobs, integrations, the database.
2. **No new daemons.** MVP reads existing tables and activity logs. Adding a new subsystem is a new tab, not new infrastructure.
3. **Native feel.** Reuses the `bg-surface` card, cyan accent, expandable `<details>` patterns. Stat tiles match the existing Infrastructure summary strip.
4. **Progressive disclosure.** KPI strip answers the 80% question. Tabs + drill-downs answer the 20%.

## Out of scope (v2)

- Circuit breakers / Redis / distributed semaphores (RankPrompt has these; we don't, and we don't need them yet — note on the page to acknowledge it's future work).
- Live-updating charts (SSE / WebSockets). We refresh on tab switch + a manual refresh button. Existing `unstable_cache` 30s TTL stays.
- Alerting / paging. Infrastructure v2 is a view, not a notifier.

## Architecture

### Page shell

Single server component at `app/admin/infrastructure/page.tsx`. Owns:

- Admin-only auth guard (preserve existing pattern).
- Top `<AdminPageHeader>` with title "Infrastructure" + subtitle "Platform observability and system health".
- A tab bar (URL-driven, `?tab=<slug>`) built on a small `InfrastructureTabs` client component.
- A KPI strip under the tab bar that swaps with the tab.
- A main content region below the strip that renders one of five tab components.

### Tabs (MVP)

| Slug | Title | Content |
| --- | --- | --- |
| `overview` | Overview | Compact health rollup: one tile per subsystem (green / yellow / red). Quick-jump links to each tab. |
| `topic-search` | Topic Search | The existing page content, relocated verbatim. No regressions. |
| `ai-providers` | AI Providers | Per-provider usage + last-error rollup reading from `topic_searches`, `prospect_audits`, `nerd_conversations`. |
| `crons` | Crons | Last run per cron route + status + duration, reading a new `cron_runs` table (see migration). |
| `integrations` | Integrations | Static list of integrations (Zernio, Supabase, Nango, OpenRouter, SearXNG, TrustGraph, ReClip) with a "configured" / "last seen" badge. |
| `database` | Database | Row counts for the 10 highest-churn tables + connection snapshot from `pg_stat_activity` via a single cached query. |

URL: `?tab=overview` is the default. Changing tab uses Next.js `router.replace` (no page reload). Tab state is also persisted in `localStorage('cortex:infrastructure:last-tab')` so the admin comes back to the tab they were last on.

### Data access

Every tab's fetch is wrapped in `unstable_cache` with a `INFRA_CACHE_TAG` so a single server action can bust the whole page when the admin clicks "Refresh". TTLs:

- KPI strip + Overview rollup: 60s
- Topic Search (existing): 30s (unchanged)
- AI Providers: 60s
- Crons: 30s
- Integrations: 5 min (mostly static config + last-seen)
- Database: 30s

### Shared components (new)

- `components/admin/infrastructure/infrastructure-tabs.tsx` — client component; renders tab pills and wires `?tab=` param.
- `components/admin/infrastructure/kpi-strip.tsx` — renders N stat tiles in a responsive grid. Re-use `Stat` inline component currently in `page.tsx` by extracting it.
- `components/admin/infrastructure/health-dot.tsx` — cyan (healthy) / amber (degraded) / coral (error) / neutral (unknown). Matches the existing `StatusPill` colors.
- `components/admin/infrastructure/provider-card.tsx` — one card per AI provider: name, last N calls, last-error excerpt, average latency (if computable).
- `components/admin/infrastructure/cron-row.tsx` — cron route name, last status, last duration, next scheduled run (derived from `vercel.json` cron `schedule`).
- `components/admin/infrastructure/integration-card.tsx` — integration name, configured?, last-seen timestamp, docs link.

All cards reuse the existing `rounded-xl border border-nativz-border bg-surface` pattern; no new design tokens.

## Data model

### New migration: `128_cron_runs.sql`

```sql
create table if not exists cron_runs (
  id uuid primary key default gen_random_uuid(),
  route text not null,               -- e.g. '/api/cron/benchmark-snapshots'
  status text not null,              -- 'ok' | 'error' | 'partial'
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms integer,
  rows_processed integer,            -- meaningful per-cron; nullable
  error text,                        -- truncated to 1000 chars
  metadata jsonb default '{}'::jsonb
);

create index idx_cron_runs_route_started on cron_runs (route, started_at desc);
create index idx_cron_runs_status on cron_runs (status) where status <> 'ok';

-- RLS: admin read/write only; no portal visibility
alter table cron_runs enable row level security;
create policy cron_runs_admin_all on cron_runs
  for all using (
    exists (select 1 from users where users.id = auth.uid() and users.role in ('admin','super_admin'))
  ) with check (
    exists (select 1 from users where users.id = auth.uid() and users.role in ('admin','super_admin'))
  );
```

### New helper: `lib/observability/cron-runs.ts`

```ts
export async function recordCronRun(params: {
  route: string;
  status: 'ok' | 'error' | 'partial';
  startedAt: Date;
  rowsProcessed?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}): Promise<void>;
```

All cron routes (`app/api/cron/**/route.ts`) call `recordCronRun` once on finish — a ~5-line addition per route. Silent failure inside `recordCronRun` (it swallows + logs) so observability failures never crash the cron.

## User flow

1. Admin clicks **Infrastructure** in sidebar.
2. Overview tab loads. Six green dots (or red/amber, if applicable) with per-subsystem last-run + count.
3. Admin spots an amber dot on **Crons** → clicks → sees the `benchmark-snapshots` cron failed twice this week. Clicks the row → inline `<details>` expands with the error message.
4. Admin clicks **Refresh** in top-right → all tab caches invalidate via server action → re-fetch.
5. Admin navigates away → returns later → lands on the tab they were last on.

## Error handling

- Every tab's data fetcher returns `{ data, error }`. The UI renders a dedicated error state per-card — never a whole-page 500.
- If `cron_runs` table is empty (e.g., in dev before a cron has run), the Crons tab renders an empty state with "No runs recorded yet — crons will show up here as they execute."
- If an integration has no credentials configured (`ZERNIO_API_KEY` unset, etc.), the card renders with a neutral dot and "Not configured" — not "error".

## Testing / QA

Visual QA is the main gate. Playwright smoke (covered in `npm run test:e2e`):

- `/admin/infrastructure?tab=overview` returns 200 and renders KPI strip.
- Tab navigation via the tab pills updates URL + renders different content.
- Non-admin user is redirected to `/admin` (auth guard preserved).

## File list

**New:**
- `supabase/migrations/128_cron_runs.sql`
- `lib/observability/cron-runs.ts`
- `components/admin/infrastructure/infrastructure-tabs.tsx`
- `components/admin/infrastructure/kpi-strip.tsx`
- `components/admin/infrastructure/health-dot.tsx`
- `components/admin/infrastructure/provider-card.tsx`
- `components/admin/infrastructure/cron-row.tsx`
- `components/admin/infrastructure/integration-card.tsx`
- `components/admin/infrastructure/tab-overview.tsx`
- `components/admin/infrastructure/tab-topic-search.tsx` (extracted from current page)
- `components/admin/infrastructure/tab-ai-providers.tsx`
- `components/admin/infrastructure/tab-crons.tsx`
- `components/admin/infrastructure/tab-integrations.tsx`
- `components/admin/infrastructure/tab-database.tsx`

**Modified:**
- `app/admin/infrastructure/page.tsx` — reduced to shell + tab dispatcher.
- `app/api/cron/**/route.ts` (7 files) — add `recordCronRun` call.
- `app/api/admin/infrastructure/refresh/route.ts` — server action for cache bust.

## Rollout

Single commit, single deploy. No feature flag. If Overview tab breaks, revert. If only one subtab breaks, that tab's card renders its own error state — the rest of the page remains usable.
