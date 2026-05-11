# PRD: ZNA · 03 · AI insights pulse (no bullshit)

> Zernio Analytics · 03/06 · 2026-05-10

## Purpose & Value

A short, surgical AI summary at the top of every client's analytics page. The pulse points at the single most important platform delta or trend in the last week, in plain English, in ≤ 4 sentences. It does not advise on posting times, best days of week, or "engage with your audience"; it tells the strategist what is actually moving. Generated daily after ZNA-01 snapshots land, gated on a real signal threshold, persisted, rendered admin + portal, dismissable, regeneratable, and flag-as-wrong-able.

## Problem

LLM analytics summaries usually devolve into "your account had varied engagement; consider posting at optimal times." Useless. The strategist already knows what time to post. The Zernio data we now have (ZNA-01) is rich enough to drive insight that is sharp ("YouTube +18% MoM driven by the last two long-form Shorts; TikTok flat; Instagram engagement off 12% week over week"). Without a constrained prompt and a hard trigger gate, a daily LLM summary becomes noise.

## Primary User

Strategist 60 seconds before a client call. Client glancing at portal.

## SMART Goals

- Pulse generated daily for every active client where at least one platform crosses the signal gate.
- Pulse body is ≤ 4 sentences, enforced both in the system prompt and by a deterministic post-validation check (regex split + length check).
- Zero pulses contain any banned topic from the banned list (post-validation regex; failed pulse is dropped, never persisted).
- ≥ 70 % of pulses judged "useful and accurate" by strategist in weekly review (tracked via the flag-as-wrong UI).
- p95 generation latency ≤ 12 s per client.
- Trigger gate: only generate when `abs(delta_pct) >= 15 %` on any of (followers / views_rolling_7d / engagements_rolling_7d) week over week, OR a trend reversal (sign of week-over-week delta changes vs prior week).

## User Stories

- **US-01** — As a strategist, I open a client's analytics page and the top card shows the daily pulse if one exists.
- **US-02** — As a strategist, I can dismiss the pulse for today (does not regenerate same day), regenerate (admin only), or flag it as wrong (admin only).
- **US-03** — As a strategist, I can lock the pulse so the next cron run does not overwrite it before I share it.
- **US-04** — As a client viewer, I see the same pulse on portal, read only, no dismiss / regenerate / lock controls.
- **US-05** — As a system, when no signal crosses the gate I render nothing (no pulse card, no empty state); the page does not need to apologise.

## In Scope

- Migration `284_client_analytics_pulses.sql` creating `client_analytics_pulses` table + RLS.
- `lib/analytics/zernio-pulse.ts` exporting `generatePulse({ clientId, snapshots })` that:
  1. Reads last 14 days of `platform_snapshots` per platform.
  2. Computes the signal-gate inputs (week-over-week deltas + reversals).
  3. Calls OpenRouter Claude Sonnet 4.5 with the system + user prompts in this PRD.
  4. Validates output schema + banned topics + sentence-count.
  5. Persists to `client_analytics_pulses` (or drops with structured log).
- Cron entry `app/api/cron/zernio-pulse/route.ts`, registered in `vercel.json`, runs daily after `sync-reporting` completes.
- Admin UI: top card on `/admin/analytics/zernio` with dismiss / regenerate / flag / lock buttons.
- Portal UI: same card on `/portal/analytics`, read only.
- Admin endpoints to dismiss, regenerate, lock, flag-as-wrong.

## Out of Scope

- Multi-pulse per day (one pulse per client per day, max).
- Pulse history view (only current pulse v1).
- Pulse for prospects (only `clients` rows, not `prospects`).
- Per-post pulses (ZNA-05 + ZNA-06 own per-post signals).
- Tuning the 15 % threshold from production data (post-launch; PRD locks at 15 % for v1).

## Resolved Decisions

- **D-01** — Single-platform focus or cross-platform synthesis? **→ Cross-platform synthesis when more than one platform crosses the gate; single-platform pulse when only one does.** Rationale: that's where the strategic value is; a brand growing on YouTube and shrinking on TikTok needs the connection drawn.
- **D-02** — Reference specific posts that drove the delta? **→ Yes when high-confidence (a post in the last 7 days is more than 2x the brand's 30-day average views); else stay platform-level.** Rationale: tighter than guessing; ZNA-05 owns the per-post comparison.
- **D-03** — Lock semantics? **→ When `is_locked=true`, the cron skips the client for that calendar day; lock auto-releases at next UTC midnight unless re-locked.** Rationale: matches strategist call cadence without permanent staleness.
- **D-04** — Where does the prompt live? **→ Inline in `lib/analytics/zernio-pulse.ts` (single source of truth), not in DB.** Rationale: prompt is product behaviour; we want it diff-able in PRs.
- **D-05** — Model? **→ `anthropic/claude-sonnet-4.5` via OpenRouter.** Rationale: per stack; consistent with Nerd surface.
- **D-06** — Temperature? **→ 0.3.** Rationale: deterministic enough for repeatable phrasing; not zero so we don't lock into a single sentence template.
- **D-07** — Output schema strict JSON or freeform? **→ Strict JSON via OpenRouter's `response_format: { type: 'json_object' }`, validated by Zod.** Rationale: post-validation needs structured fields, not a regex on prose.
- **D-08** — Banned-topic enforcement? **→ Both in prompt (verbatim list) AND post-validation regex against the JSON body; failed pulse is dropped + logged + counted in `pulse_drops_banned_total` metric.** Rationale: prompt nudges; regex enforces.
- **D-09** — Sentence count enforcement? **→ Post-validation splits body on `. ` `! ` `? ` and counts; > 4 → drop + regenerate-once; second failure → drop entirely.** Rationale: keeps pulse short without a brittle prompt.
- **D-10** — Trigger gate signal metric? **→ Any of followers, views_rolling_7d, engagements_rolling_7d week-over-week.** Rationale: matches the three series ZNA-02 already renders.
- **D-11** — Sparse-prior-window suppression? **→ Suppress gate when prior 7d has < 4 days of data; client gets no pulse that day.** Rationale: same suppression rule as ZNA-02; consistent.
- **D-12** — Dismiss persistence? **→ Dismiss is per calendar day per client; same UTC day, no regeneration unless an admin clicks Regenerate.** Rationale: don't fight the strategist; let them mute today's pulse without losing tomorrow's.
- **D-13** — Flag-as-wrong? **→ Sets `flagged_wrong_at` + `flagged_wrong_by` + optional `flagged_wrong_reason`; does NOT auto-regenerate; informs v2 prompt tuning.** Rationale: feedback signal, not a rewrite trigger.
- **D-14** — Cron schedule? **→ `30 7 * * *` UTC, runs 30 minutes after `sync-reporting` cron (which runs at `0 7 * * *`).** Rationale: snapshots have to be in the table before we read them.
- **D-15** — Where does the cron live? **→ `app/api/cron/zernio-pulse/route.ts`, mirrors `sync-reporting` cron shape (`withCronTelemetry`, `Authorization: Bearer ${CRON_SECRET}`).** Rationale: existing pattern.
- **D-16** — Max output tokens? **→ 400.** Rationale: 4 sentences fit in ~80 tokens; 400 is generous headroom for JSON envelope + signal fields.
- **D-17** — Portal cron permission? **→ Cron writes via admin client; portal reads via `getPortalClient()` + RLS; org filter on read in addition to RLS.** Rationale: same portal pattern as every other table.

## Data Model

### Migration `284_client_analytics_pulses.sql`

```sql
-- ============================================================
-- ZNA-03: Daily AI analytics pulse per client.
-- One row per client per UTC day. Cron generates, admin/portal reads.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_analytics_pulses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pulse_date DATE NOT NULL,                       -- UTC date the pulse is "for"
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  body TEXT NOT NULL,                             -- ≤ 4 sentences, validated
  signal_metric TEXT NOT NULL CHECK (signal_metric IN
    ('followers','views_rolling_7d','engagements_rolling_7d','trend_reversal','cross_platform')),
  signal_value NUMERIC(8,2),                      -- e.g. 18.5 for +18.5 %; null for cross_platform / trend_reversal pulses
  platforms_referenced TEXT[] NOT NULL DEFAULT '{}',  -- subset of ('tiktok','instagram','facebook','youtube')
  referenced_post_ids UUID[] NOT NULL DEFAULT '{}',   -- post_metrics rows that drove the pulse
  model TEXT NOT NULL,                            -- 'anthropic/claude-sonnet-4.5'
  prompt_version TEXT NOT NULL,                   -- e.g. 'zna-pulse-v1'
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES users(id),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES users(id),
  flagged_wrong_at TIMESTAMPTZ,
  flagged_wrong_by UUID REFERENCES users(id),
  flagged_wrong_reason TEXT,
  CONSTRAINT client_analytics_pulses_unique_per_day UNIQUE (client_id, pulse_date)
);

CREATE INDEX IF NOT EXISTS idx_client_analytics_pulses_client_date
  ON client_analytics_pulses(client_id, pulse_date DESC);
CREATE INDEX IF NOT EXISTS idx_client_analytics_pulses_org
  ON client_analytics_pulses(organization_id);

ALTER TABLE client_analytics_pulses ENABLE ROW LEVEL SECURITY;

-- Admins: full access.
CREATE POLICY client_analytics_pulses_admin_all ON client_analytics_pulses
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('admin','super_admin')
  ));

-- Viewers (portal): read only, scoped to organization_id.
CREATE POLICY client_analytics_pulses_viewer_read ON client_analytics_pulses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'viewer'
      AND users.organization_id = client_analytics_pulses.organization_id
  ));
```

## API Contracts

### `GET /api/cron/zernio-pulse`

Auth: `Authorization: Bearer ${CRON_SECRET}`.

Behavior: fan-out across active clients.

1. For each `clients` row where `is_active=true AND is_paused=false`:
   - Skip if a row exists for `(client_id, today_utc)` with `is_locked=true`.
   - Read last 14 days of `platform_snapshots` per platform.
   - Compute week-over-week delta + reversal per platform.
   - Apply trigger gate (≥ 15 % delta OR reversal, with sparse-prior suppression).
   - If gated, call `generatePulse()`; upsert into `client_analytics_pulses` ON CONFLICT (client_id, pulse_date) DO UPDATE.
   - Increment Prometheus-style counters in logs: `pulse_generated`, `pulse_gated_out`, `pulse_dropped_banned`, `pulse_dropped_sentence_count`, `pulse_failed_llm`.
2. Use `Promise.all` over clients with a concurrency cap of 5 to respect rate limits.

Response (200):

```ts
{
  generated: number;
  gated_out: number;
  dropped: number;
  failed: number;
  duration_ms: number;
}
```

Wrap in `withCronTelemetry`. `export const maxDuration = 300`.

### `GET /api/analytics/zernio/pulse` (admin)

Auth: admin (`createAdminClient()` + role check).

Query:

```ts
const QuerySchema = z.object({ client_id: z.string().uuid() });
```

Response (200):

```ts
type PulseResponse =
  | { pulse: null }
  | {
      pulse: {
        id: string;
        client_id: string;
        pulse_date: string;
        generated_at: string;
        body: string;
        signal_metric: 'followers' | 'views_rolling_7d' | 'engagements_rolling_7d' | 'trend_reversal' | 'cross_platform';
        signal_value: number | null;
        platforms_referenced: string[];
        referenced_post_ids: string[];
        is_dismissed: boolean;
        is_locked: boolean;
        flagged_wrong_at: string | null;
      };
    };
```

Returns the most recent non-dismissed row for `today_utc`; if dismissed, returns `pulse: null`.

### `GET /api/portal/analytics/zernio/pulse` (portal)

Auth: portal (`getPortalClient()`).

No query params; derives `client_id` from session.

Same response shape; admin-only fields (`flagged_wrong_at`) omitted.

### `POST /api/analytics/zernio/pulse/:id/dismiss` (admin)

Auth: admin.

Behavior: sets `is_dismissed=true`, `dismissed_at=now()`, `dismissed_by=user_id`.

Response (200): `{ ok: true }`.

### `POST /api/analytics/zernio/pulse/regenerate` (admin)

Auth: admin.

Request:

```ts
const RegenerateSchema = z.object({ client_id: z.string().uuid() });
```

Behavior: invokes `generatePulse()` synchronously, upserts the row, returns the new pulse.

Response (200): `{ pulse: <PulseResponse['pulse']> }`.

Errors: 400 invalid, 401, 422 `{ error: 'no_signal' }` when gate fails, 422 `{ error: 'banned_topic' }` when post-validation drops the LLM output twice in a row.

### `POST /api/analytics/zernio/pulse/:id/lock` (admin)

Request:

```ts
const LockSchema = z.object({ locked: z.boolean() });
```

Behavior: toggles `is_locked`; sets `locked_at` + `locked_by` when `true`.

Response (200): `{ ok: true, is_locked: boolean }`.

### `POST /api/analytics/zernio/pulse/:id/flag-wrong` (admin)

Request:

```ts
const FlagSchema = z.object({ reason: z.string().max(500).optional() });
```

Behavior: sets `flagged_wrong_at=now()`, `flagged_wrong_by=user_id`, `flagged_wrong_reason=reason ?? null`.

Response (200): `{ ok: true }`.

All admin write routes return 401 on missing auth, 403 on non-admin role, 404 when pulse id not found.

## LLM Prompts

### Prompt: `zna-pulse-v1`

Model: `anthropic/claude-sonnet-4.5` via OpenRouter.
Temperature: 0.3.
Max tokens: 400.
Response format: `json_object`.

System:

```
You write daily analytics pulses for a social-content agency's clients.

You will receive a structured signal report covering the client's last 14 days
of platform metrics: followers, rolling 7-day views, rolling 7-day engagements,
per-platform week-over-week deltas, and any high-confidence posts that drove a
delta.

You return a short, surgical, plain-English pulse that points at the SINGLE most
important trend or delta. Cross-platform synthesis is welcome when more than one
platform has signal.

HARD RULES:
1. Maximum 4 sentences in the "body" field. Count again before responding.
2. No banned topics (listed below). If you find yourself drifting into one,
   rewrite the sentence around the actual data.
3. No platitudes, no generic advice, no "consider," no "you might want to."
   State what is happening.
4. Refer to platforms by their proper names: TikTok, Instagram, YouTube,
   Facebook. Sentence case for everything else.
5. Numbers are facts; quote them. Use percentage signs for deltas. Round to one
   decimal.
6. Never reference posting times, best posting days, optimal cadence, time of
   day, weekday vs weekend, "engage with audience," "post consistently,"
   "leverage trends," "go viral," "engagement is key," or "create more content."
7. No em dash, no en dash. Use commas, periods, colons, or parentheses.

BANNED TOPICS (these strings or paraphrases of them must NEVER appear):
- posting time, posting times, best time to post, optimal posting time
- best day, best days of the week, day of the week to post
- post consistently, posting frequency, post more often, cadence
- engage with your audience, engagement is key, build community
- leverage trends, ride trends, go viral, virality, trending sounds
- create more content, content is king, content calendar advice
- algorithm tips, beat the algorithm, gaming the algorithm
- generic platitudes like "keep up the good work" or "great progress"

You output JSON matching exactly this schema:
{
  "body": string,                    // ≤ 4 sentences, plain English
  "signal_metric": "followers" | "views_rolling_7d" | "engagements_rolling_7d" | "trend_reversal" | "cross_platform",
  "signal_value": number | null,     // the week-over-week percent for the headline metric, null for cross_platform / trend_reversal
  "platforms_referenced": ("tiktok"|"instagram"|"facebook"|"youtube")[],
  "referenced_post_ids": string[]    // 0..3 post_metrics ids you actually leaned on, copied from the input
}
```

User template:

```
Client: {{client_name}}
Pulse date (UTC): {{pulse_date}}

Last 14 days signal report:
{{signal_report_json}}

High-confidence posts (last 7 days, >2x 30-day average views):
{{high_confidence_posts_json}}

Return the JSON object now.
```

`signal_report_json` is the deterministic input shape:

```ts
{
  platforms: Array<{
    platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube';
    followers_current_7d_mean: number;
    followers_prior_7d_mean: number;
    followers_delta_pct: number | null;
    views_rolling_7d_current: number;
    views_rolling_7d_prior: number;
    views_delta_pct: number | null;
    engagements_rolling_7d_current: number;
    engagements_rolling_7d_prior: number;
    engagements_delta_pct: number | null;
    sparse_prior: boolean;
    trend_reversal: boolean;
  }>;
  triggered_gates: Array<{
    platform: string;
    metric: 'followers' | 'views_rolling_7d' | 'engagements_rolling_7d' | 'trend_reversal';
    value: number | null;
  }>;
}
```

Output schema (Zod):

```ts
const PulseOutputSchema = z.object({
  body: z.string().min(10).max(800),
  signal_metric: z.enum([
    'followers',
    'views_rolling_7d',
    'engagements_rolling_7d',
    'trend_reversal',
    'cross_platform',
  ]),
  signal_value: z.number().nullable(),
  platforms_referenced: z.array(z.enum(['tiktok','instagram','facebook','youtube'])).max(4),
  referenced_post_ids: z.array(z.string().uuid()).max(3),
});
```

Banned-topic post-validation regex (case-insensitive, applied to `body`):

```ts
const BANNED_PATTERNS: RegExp[] = [
  /\b(posting\s+time|best\s+time\s+to\s+post|optimal\s+posting)\b/i,
  /\b(best\s+day|day\s+of\s+the\s+week\s+to\s+post|weekday\s+vs\s+weekend)\b/i,
  /\b(post\s+consistently|posting\s+frequency|post\s+more\s+often|cadence)\b/i,
  /\b(engage\s+with\s+your\s+audience|engagement\s+is\s+key|build\s+community)\b/i,
  /\b(leverage\s+trends|ride\s+trends|go\s+viral|virality|trending\s+sounds)\b/i,
  /\b(create\s+more\s+content|content\s+is\s+king|content\s+calendar)\b/i,
  /\b(beat\s+the\s+algorithm|gaming\s+the\s+algorithm|algorithm\s+tip)\b/i,
  /\b(keep\s+up\s+the\s+good\s+work|great\s+progress|nice\s+work)\b/i,
  /[—–]/, // em + en dash, hard ban
];
```

Sentence count check:

```ts
function countSentences(body: string): number {
  return body
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .filter(Boolean).length;
}
```

If `countSentences(body) > 4` or any banned pattern matches, drop the pulse, attempt one retry with the same prompt + a `RETRY: previous output failed validation, try again, shorter and on-topic.` suffix. If retry also fails, persist nothing and log `pulse_dropped_*` reason.

## TypeScript types + module shape

### `lib/analytics/zernio-pulse.ts`

```ts
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const PROMPT_VERSION = 'zna-pulse-v1';
export const MODEL = 'anthropic/claude-sonnet-4.5';

export interface SignalReport { /* matches signal_report_json above */ }
export interface HighConfidencePost {
  post_id: string;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube';
  views: number;
  ratio_to_baseline: number;
  caption_snippet: string;
}

export interface PulseInput {
  client_id: string;
  client_name: string;
  organization_id: string;
  pulse_date: string;          // YYYY-MM-DD UTC
  signal_report: SignalReport;
  high_confidence_posts: HighConfidencePost[];
}

export interface PulseGenerationResult {
  status: 'persisted' | 'gated_out' | 'dropped_banned' | 'dropped_sentence_count' | 'dropped_schema' | 'llm_error';
  pulse_id?: string;
  body?: string;
  signal_metric?: string;
  signal_value?: number | null;
  latency_ms: number;
}

export async function generatePulse(args: {
  supabase: SupabaseClient;
  input: PulseInput;
  isRegenerate?: boolean;
}): Promise<PulseGenerationResult>;
```

Flow:

1. If `signal_report.triggered_gates.length === 0 && !args.isRegenerate`, return `gated_out`.
2. Build prompt with template substitution.
3. Call OpenRouter. AI fields null-safe on parsing.
4. Validate via `PulseOutputSchema`; on schema fail, retry once with stricter suffix.
5. Run banned-topic regex; on hit, retry once; second hit, return `dropped_banned`.
6. Run sentence-count check; on >4, retry once; second hit, return `dropped_sentence_count`.
7. Upsert into `client_analytics_pulses` ON CONFLICT (client_id, pulse_date) DO UPDATE clearing `is_dismissed`, `flagged_wrong_at`.
8. Return `persisted`.

### `lib/analytics/zernio-pulse-signal.ts`

```ts
export interface SignalGateInputs {
  supabase: SupabaseClient;
  clientId: string;
  asOfDate: string;            // UTC today
}

export async function buildSignalReport(args: SignalGateInputs): Promise<SignalReport>;
export async function findHighConfidencePosts(args: SignalGateInputs): Promise<HighConfidencePost[]>;
```

`buildSignalReport`:

- For each of 4 platforms, fetch the last 14 `platform_snapshots` rows.
- Compute current-7d-mean and prior-7d-mean of each metric.
- `sparse_prior = prior 7d has < 4 rows`.
- `trend_reversal = sign(current_delta) !== sign(prior_delta)`.
- Push to `triggered_gates` when `abs(delta_pct) >= 15` and not sparse, OR `trend_reversal && !sparse_prior`.

`findHighConfidencePosts`:

- Read last 7 days of `post_metrics` for the client.
- Compute brand 30-day average views per platform.
- Return posts where `views / brand_avg_for_platform >= 2.0`, sorted desc by ratio, max 5.

## UI Components

### `components/analytics/zernio-pulse-card.tsx`

Top of file: `'use client'`.

Purpose: top-of-page card on `/admin/analytics/zernio` and `/portal/analytics`.

Props:

```ts
type Props = {
  pulse: PulseResponse['pulse'] | null;
  isPortal?: boolean;
  onDismiss?: () => Promise<void>;
  onRegenerate?: () => Promise<void>;
  onToggleLock?: (locked: boolean) => Promise<void>;
  onFlagWrong?: (reason?: string) => Promise<void>;
};
```

Layout: `bg-surface` rounded card, full width above platform cards. Left side: small `Sparkles` icon in h-9 w-9 accent swatch, then body text. Right side: action row (admin only): Lock / Regenerate / Flag wrong / Dismiss buttons.

Copy:

- When `pulse` is null: card does not render (no empty state).
- When pulse present: body text rendered as-is. Below body, small caption (text-xs muted): "{relativeTime(generated_at)} · {signal_metric_label}".
- Locked state caption: "Locked by {user.name} · auto-unlocks at UTC midnight".
- Flagged state caption: "Flagged as wrong {relativeTime(flagged_wrong_at)}".
- Button labels: "Lock pulse" / "Unlock pulse", "Regenerate", "Flag as wrong", "Dismiss".
- Confirm copy on Dismiss: "Hide today's pulse?"
- Toast copy on Regenerate success: "Pulse regenerated."
- Toast copy on `no_signal` error: "No signal crossed the threshold today."
- Toast copy on `banned_topic` error: "Model output failed validation twice. Try again later."

States: loading (skeleton 3 lines), present, locked, dismissed (does not render), flagged (renders with subtle warning border, action row still active).

Tokens: `bg-surface`, `text-foreground`, muted captions `text-muted-foreground`, locked border `border-amber-500/30`, flagged border `border-red-500/30`.

Accessibility: buttons have `aria-label`; action row is `role="toolbar"`; buttons never wrap (`<Button>` primitive).

### Admin and portal page wiring

- `app/admin/analytics/zernio/page.tsx` (from ZNA-02) gains a `<ZernioPulseCard />` above the platform card grid.
- `app/portal/analytics/page.tsx` (from ZNA-02) gains the same card with `isPortal=true` and undefined action handlers.

## File Map

Create:

- `supabase/migrations/284_client_analytics_pulses.sql`
- `lib/analytics/zernio-pulse.ts`
- `lib/analytics/zernio-pulse-signal.ts`
- `lib/analytics/zernio-pulse.test.ts`
- `lib/analytics/zernio-pulse-signal.test.ts`
- `app/api/cron/zernio-pulse/route.ts`
- `app/api/analytics/zernio/pulse/route.ts`
- `app/api/analytics/zernio/pulse/[id]/dismiss/route.ts`
- `app/api/analytics/zernio/pulse/[id]/lock/route.ts`
- `app/api/analytics/zernio/pulse/[id]/flag-wrong/route.ts`
- `app/api/analytics/zernio/pulse/regenerate/route.ts`
- `app/api/portal/analytics/zernio/pulse/route.ts`
- `components/analytics/zernio-pulse-card.tsx`
- `tasks/ralph/zna-03-ai-insights-pulse/progress.txt`

Modify:

- `vercel.json` (add `zernio-pulse` cron entry at `30 7 * * *`).
- `app/admin/analytics/zernio/page.tsx` (mount `<ZernioPulseCard />` above platform grid).
- `app/portal/analytics/page.tsx` (mount card read-only).
- `lib/supabase/types.ts` (regenerated).
- `.env.example` (no new vars, but verify `OPENROUTER_API_KEY` is documented).

## Env Vars

None new. Reuses `OPENROUTER_API_KEY` (already consumed by Nerd) and `CRON_SECRET`.

## Edge Cases

- **No active clients.** Cron logs `generated: 0`; returns 200.
- **Client is paused.** Skip; no row.
- **Client has zero `social_profiles`.** Skip; no row.
- **Sparse prior window across all platforms.** No gate triggers; cron returns `gated_out` for that client; no pulse row, no card on UI.
- **LLM returns invalid JSON.** Retry once; second failure → drop with `dropped_schema`; no row.
- **LLM returns banned topic.** Retry once with stricter suffix; second failure → drop with `dropped_banned`.
- **LLM returns > 4 sentences.** Retry once; second failure → drop with `dropped_sentence_count`.
- **Pulse exists for today but cron re-runs.** UPSERT clears `is_dismissed` only when generating a new body; if the new body equals the old body string, leave dismissal alone.
- **Admin clicks Regenerate but gate fails.** Return 422 `{ error: 'no_signal' }`; toast surfaces it.
- **Lock toggled `true` after cron already ran today.** Pulse stays; next cron skips this client.
- **Viewer attempts admin write routes.** All admin routes return 403 on role check.
- **Viewer fetches `/api/portal/.../pulse` after admin dismissed today's pulse.** Portal returns `pulse: null` (matches admin behaviour).
- **Pulse referenced post that was later deleted.** UI ignores missing `post_metrics` ids gracefully; pulse body still renders.
- **Body contains an em dash.** Banned-topic regex `/[—–]/` catches it; drop; retry; second failure → log `dropped_banned`.
- **Concurrency: two admins regenerate at once.** ON CONFLICT DO UPDATE handles it; last write wins; latency_ms recorded per call.

## Test Plan

Unit:

- `lib/analytics/zernio-pulse-signal.test.ts`: gate triggers at ≥ 15 %, suppressed when sparse, trend reversal detection, high-confidence post detection.
- `lib/analytics/zernio-pulse.test.ts`:
  - Schema validation passes on a clean response.
  - Banned-topic regex catches every example string in the banned list (table-driven test).
  - Sentence counter correctly counts 1 / 2 / 3 / 4 / 5 sentence fixtures.
  - `dropped_banned` returned when both attempts hit banned regex.
  - `gated_out` returned when no triggers and not regenerate.
  - Upsert clears `is_dismissed` only when body changes.

Integration:

- Cron route smoke: with two seeded clients (one passing gate, one sparse), assert `generated=1, gated_out=1`.
- Admin pulse fetch: returns the row; portal pulse fetch with matching org returns the row; portal fetch with mismatched org returns `pulse: null`.

E2E (Playwright):

- Admin: navigate to `/admin/analytics/zernio?clientId=<nike>`; pulse card renders; click Dismiss → card disappears; reload → still gone; click Regenerate → card re-renders.
- Portal: log in as viewer; pulse card renders read-only; no Dismiss / Regenerate buttons visible.

Manual QA:

- Trigger cron manually against staging with a tripped sparse prior; confirm zero rows.
- Trigger cron with a forced banned-topic mock; observe `pulse_dropped_banned` log line.

## Architecture Wiring

- Cron runs 30 min after `sync-reporting`; shared `withCronTelemetry` pattern + `Authorization: Bearer ${CRON_SECRET}`.
- Reads from `platform_snapshots` (ZNA-01) and `post_metrics`.
- LLM call uses the same OpenRouter client that Nerd uses; no new env var.
- Writes to new `client_analytics_pulses` table with RLS that mirrors every other portal-readable table (admin all, viewer read where `organization_id` matches).
- UI mounts inside the ZNA-02 page above the platform cards; portal mirror inside `/portal/analytics`.
- Admin write routes mirror existing `app/api/admin/...` patterns: Zod, role check, admin client, `NextResponse.json()`.

## Done When

- Migration applied; `client_analytics_pulses` table present with RLS policies.
- `npx tsc --noEmit` clean; `npm run lint` clean.
- Cron `zernio-pulse` registered in `vercel.json` and runs daily on staging.
- For 5 seeded clients, gate triggers on ≥ 1; pulses persist; sentence count ≤ 4 verified.
- Zero banned-topic strings appear in any persisted body (verified by SQL `SELECT body FROM client_analytics_pulses` + regex grep).
- Pulse card renders on `/admin/analytics/zernio` and `/portal/analytics`; admin actions (dismiss / regenerate / lock / flag) all work end-to-end.
- Locked pulses survive the next cron run unchanged.
- progress.txt fully `[x]`.
