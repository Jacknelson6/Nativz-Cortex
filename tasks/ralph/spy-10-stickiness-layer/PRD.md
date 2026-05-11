# PRD: SPY · 10 · Stickiness layer + post-demo touchpoints

> Spying → Prospect Pipeline · 10/10 · 2026-05-10

## Purpose & Value

Most prospects don't sign on the first call; they need 5-12 touchpoints across 30-90 days. This phase automates the warm-touchpoint layer — weekly competitor digests, monthly format reports — that keeps the brand in front of the prospect without manual sales rep effort. Every send is sales-rep-approved (no autonomous email send), but every draft is one click away from going out.

## Problem

Sales reps can't manually email 30 prospects weekly with bespoke insights. Without a stickiness mechanism, prospects ghost. With one, the agency demonstrates ongoing value before the prospect has paid a dollar.

## Primary User

Prospect (passive consumer of digests). Sales rep (configures cadence + reviews engagement + approves sends).

## SMART Goals

- ≥40% of prospects who receive a digest open it (industry benchmark).
- ≥10% of digests result in a click-through to the prospect's Cortex record (engagement signal).
- 100% of digests are auto-drafted; sales rep approves with one click before send.
- Zero accidental sends (per `feedback_no_autonomous_email_send.md`).
- Approval queue clears within 24h of draft generation 80%+ of the time.

## User Stories

- **US-01** — As a sales rep, on each prospect's record I can toggle "Send weekly competitor digest" with a starting date.
- **US-02** — As a sales rep, every Monday morning I see a queue of drafted digests for my prospects at `/admin/prospects/digests` with a "Send" button per row (never auto-send).
- **US-03** — As a prospect, I receive a clean, branded email summarizing what changed in my competitor landscape this week and a CTA to "See the full report on Cortex."
- **US-04** — As a sales rep, I see open + click telemetry per digest on the prospect's record.
- **US-05** — As a prospect, I can unsubscribe per-digest-type via a one-click link.
- **US-06** — As an admin, I can review aggregate digest performance (open rate, click rate) across all prospects.

## In Scope

- Migration `283_prospect_digests.sql`: `prospect_digest_subscriptions`, `prospect_digest_drafts`, `prospect_digest_events`.
- Digest types: `weekly_competitor`, `monthly_format`.
- Digest builder `lib/prospects/digest-builder.ts` produces a Draft (subject + HTML body) per prospect per cadence.
- LLM polish step for digest copy via Sonnet 4.5 (templated, low-temp).
- Approval queue UI `/admin/prospects/digests`.
- Email delivery via Resend (existing integration).
- Open tracking via Resend; click tracking via internal redirect route.
- Per-type unsubscribe page `/p/digest-unsubscribe/[token]`.
- Daily cron `app/api/cron/prospect-digest-build/route.ts` that builds drafts for due subscriptions.
- Per-prospect telemetry panel.
- Aggregate admin dashboard at `/admin/prospects/digests/stats`.

## Out of Scope

- Auto-send without approval (forbidden per memory rule).
- A/B testing subject lines (defer).
- Prospect reply parsing / threading (manual handling v1; replies go to sales rep inbox via Reply-To).
- SMS / WhatsApp digests.
- Per-prospect custom digest schedule (only weekly + monthly; pickable on/off).

## Resolved Decisions

- **D-01** — Frequency cap when weekly + monthly would fire same day? **→ Weekly takes precedence; monthly defers by 1 week.** Rationale: avoid double-emailing.
- **D-02** — Unsubscribe granularity? **→ Per-type (weekly/monthly) AND all-stop link.** Rationale: maximize retention.
- **D-03** — Reply-To address? **→ The owning sales rep's @nativz.io address.** Rationale: replies flow to the right human.
- **D-04** — Opt-in posture? **→ Prospects are auto-opted-in when sales rep enables the digest subscription; every email has a clear unsubscribe link.** Rationale: CAN-SPAM compliant for B2B prospecting; GDPR considered (record consent timestamp).
- **D-05** — Hard send rate-limit? **→ Max 1 send per prospect per 72h regardless of approvals.** Rationale: anti-spam belt and suspenders.
- **D-06** — LLM in the loop? **→ Yes, low-temp Sonnet 4.5 polishes the subject + opening line per digest from deterministic structured input.** Rationale: warmth + reduced template fatigue.
- **D-07** — Sender? **→ Configurable per environment via `PROSPECT_DIGEST_FROM` env var; default `digests@nativz.io`.** Rationale: deliverability.
- **D-08** — Approval timeout? **→ Drafts auto-expire after 7 days unreviewed; admin push notification at 48h to nudge.** Rationale: stale digests aren't worth sending.
- **D-09** — Where do click-throughs land? **→ All CTAs route to the SPY-09 presentation public link (if minted) or SPY-04 scorecard public link as fallback.** Rationale: best-experience public surface; same destination already proven valuable.
- **D-10** — Format report data source? **→ VFF library brand-scoped queries; queries top-5 formats trending in the prospect's niche over last 30d.** Rationale: VFF is the canonical format taxonomy.
- **D-11** — Aggregate dashboard scope? **→ Per-sales-rep + global toggle; data from `prospect_digest_events`.** Rationale: rep accountability.
- **D-12** — Send via Gmail SA draft or Resend? **→ Resend (HTML branded transactional).** Rationale: deliverability + open tracking + branded template; SA draft is for 1:1 outreach per `feedback_no_autonomous_email_send.md`, not for system-generated digests. Approval-before-send still applies.
- **D-13** — Click tracking impl? **→ Internal redirect `/r/d/[event_id]` 302s to destination + logs.** Rationale: no third-party tracker; control over data.

## Data Model

### Migration `283_prospect_digests.sql`

```sql
-- ============================================================
-- SPY-10: Prospect digest subscriptions + drafts + events
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_digest_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('weekly_competitor','monthly_format')),
  active BOOLEAN NOT NULL DEFAULT true,
  start_date DATE NOT NULL,
  last_built_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  unsubscribed_via TEXT CHECK (unsubscribed_via IN ('per_type','all_stop')),
  unsubscribe_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(prospect_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_pds_active
  ON prospect_digest_subscriptions(active, kind) WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_pds_prospect
  ON prospect_digest_subscriptions(prospect_id);

CREATE TABLE IF NOT EXISTS prospect_digest_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES prospect_digest_subscriptions(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('weekly_competitor','monthly_format')),
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  to_email TEXT NOT NULL,
  reply_to_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted'
    CHECK (status IN ('drafted','approved','sent','expired','rejected')),
  resend_message_id TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pdd_status
  ON prospect_digest_drafts(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_pdd_prospect
  ON prospect_digest_drafts(prospect_id);

CREATE TABLE IF NOT EXISTS prospect_digest_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES prospect_digest_drafts(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sent','opened','clicked','unsubscribed','bounced','complained')),
  target_url TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pde_draft ON prospect_digest_events(draft_id);
CREATE INDEX IF NOT EXISTS idx_pde_kind_time ON prospect_digest_events(kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pde_prospect ON prospect_digest_events(prospect_id);

-- updated_at triggers
CREATE TRIGGER trg_pds_updated_at
  BEFORE UPDATE ON prospect_digest_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_pdd_updated_at
  BEFORE UPDATE ON prospect_digest_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: admin-only on the 3 tables.
ALTER TABLE prospect_digest_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_digest_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_digest_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_pds ON prospect_digest_subscriptions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

CREATE POLICY admin_all_pdd ON prospect_digest_drafts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

CREATE POLICY admin_all_pde ON prospect_digest_events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
```

## Types

`lib/prospects/types.ts` additions:

```ts
export type DigestKind = 'weekly_competitor' | 'monthly_format';
export type DigestStatus = 'drafted' | 'approved' | 'sent' | 'expired' | 'rejected';
export type DigestEventKind = 'sent' | 'opened' | 'clicked' | 'unsubscribed' | 'bounced' | 'complained';

export interface DigestSubscription {
  id: string;
  prospect_id: string;
  kind: DigestKind;
  active: boolean;
  start_date: string;
  last_built_at: string | null;
  last_sent_at: string | null;
  unsubscribed_at: string | null;
  unsubscribed_via: 'per_type' | 'all_stop' | null;
  unsubscribe_token: string | null;
}

export interface DigestDraft {
  id: string;
  subscription_id: string;
  prospect_id: string;
  kind: DigestKind;
  subject: string;
  html: string;
  text: string;
  to_email: string;
  reply_to_email: string;
  status: DigestStatus;
  expires_at: string;
  payload: WeeklyCompetitorPayload | MonthlyFormatPayload;
}

export interface WeeklyCompetitorPayload {
  highlights: Array<{
    competitor_handle: string;
    competitor_platform: string;
    headline: string; // <= 100 chars
    body: string;     // <= 240 chars
    alert_id: string; // FK to prospect_monitor_alerts
  }>;
  week_range: { from: string; to: string };
  cta_url: string;
}

export interface MonthlyFormatPayload {
  formats: Array<{
    format_id: string;
    format_name: string;
    why_it_works: string; // <= 240 chars
    sample_post_urls: string[];
  }>;
  month: string; // ISO YYYY-MM
  cta_url: string;
}
```

## LLM Prompt: digest polish

`lib/prospects/digest-polish.ts`:

System prompt (Sonnet 4.5 via OpenRouter, temperature 0.3, max_tokens 600):

```
You are an email copywriter polishing a B2B prospecting digest. The reader is a brand owner who got an audit from Nativz a few weeks ago but hasn't signed yet.

INPUTS:
- Brand name: {brand_name}
- Digest kind: {kind}
- Structured payload (JSON): {payload}

TASK:
- Write ONE subject line (<=60 chars) and ONE opening paragraph (<=400 chars).
- Subject must reference what's new without being clickbaity.
- Opening must be warm, specific to brand_name, and lead into the highlights below.
- Sentence case. No em or en dashes. No "drops" (use "posts"). No exclamation marks.
- Output strictly JSON {"subject": "...", "opening": "..."}.
```

Fallback: if LLM fails, use templated subject "What's new with your competitors this week" + generic opening.

## API Surface

### `POST /api/prospects/[id]/digest/subscribe`

```ts
const Body = z.object({
  kind: z.enum(['weekly_competitor', 'monthly_format']),
  start_date: z.string().date(),
});
```

Response: `{ subscription: DigestSubscription }`. Upserts; mints unsubscribe_token.

### `DELETE /api/prospects/[id]/digest/subscribe`

```ts
const Body = z.object({ kind: z.enum(['weekly_competitor', 'monthly_format']) });
```

Soft-stop (`active=false`).

### `GET /api/prospects/digests`

Query: `status` (default `drafted`), `assigned_to_me` (boolean), `page`. Admin auth. Returns paginated draft rows for approval queue.

### `POST /api/prospects/digests/[draft_id]/approve`

Approves + sends via Resend. Sets status='sent', sent_at, resend_message_id; logs digest_event kind='sent'. Admin auth.

### `POST /api/prospects/digests/[draft_id]/reject`

Sets status='rejected'. Admin auth.

### `GET /api/prospects/digests/[draft_id]/preview`

Returns HTML preview. Admin auth.

### `GET /r/d/[event_id]?to=<encoded_url>`

Public; 302 to decoded `to`; inserts digest_event kind='clicked' with target_url + ip_hash + user_agent.

### `GET /p/digest-unsubscribe/[token]`

Public page; renders "Are you sure?" + buttons for per-type or all-stop. POSTs to itself.

### `POST /api/cron/prospect-digest-build`

CRON_SECRET auth. Daily. For each active subscription due today:
- Weekly: due if `last_built_at IS NULL OR last_built_at < now() - 7d`, day-of-week filter from start_date.
- Monthly: due if `last_built_at IS NULL OR last_built_at < now() - 30d`.
- Apply D-01 collision (weekly precedence).
- Build payload + polish + insert draft.
- Apply D-05 hard cap (no draft if last_sent_at within 72h).
- Push notification to owning sales rep "N digests ready for review".

### `POST /api/webhooks/resend`

Resend webhook for opens / bounces / complaints. Verifies signature. Inserts digest_events.

## Components

### `components/prospects/digest-subscription-toggle.tsx`

Props: `{ prospectId, kind }`. Two toggles on prospect detail (Stickiness tab); POSTs subscribe/unsubscribe.

### `components/prospects/digest-telemetry-panel.tsx`

Props: `{ prospectId }`. Shows last N digests with sent/open/click stamps + thumbnails of subject lines.

### `components/prospects/digest-approval-queue.tsx`

Props: `{ filter: 'all' | 'mine' }`. Lists drafts with subject + brand + kind + Preview/Send/Reject buttons. Live-updates after action.

### `components/prospects/digest-preview-modal.tsx`

Props: `{ draftId }`. Renders HTML preview inside iframe; Send/Reject/Close.

### `components/prospects/digest-stats-dashboard.tsx`

Props: `{ scope: 'mine' | 'global' }`. Charts: sends per week, open rate, click rate, unsubscribe rate.

## Pages

### `/admin/prospects/digests/page.tsx`

Approval queue + filters.

### `/admin/prospects/digests/stats/page.tsx`

Aggregate stats dashboard.

### `/p/digest-unsubscribe/[token]/page.tsx`

Public per-token unsubscribe.

## Email Template

`lib/prospects/digest-template.ts` builds branded HTML per `docs/email-style.md`:
- Logo header.
- LLM-polished opening paragraph.
- Numbered highlights (3 for weekly, 5 for monthly).
- Single primary CTA button → tracked link `/r/d/[event_id]?to=<presentation_url>`.
- Footer with sales-rep contact + "Unsubscribe weekly" link + "Stop all" link.
- No em / en dashes. Sentence case. Brand colors.

## File Inventory

New files:
- `supabase/migrations/283_prospect_digests.sql`
- `lib/prospects/digest-builder.ts`
- `lib/prospects/digest-builder.test.ts`
- `lib/prospects/digest-polish.ts`
- `lib/prospects/digest-polish.test.ts`
- `lib/prospects/digest-template.ts`
- `lib/prospects/digest-template.test.ts` (snapshot)
- `lib/prospects/build-weekly-competitor-payload.ts`
- `lib/prospects/build-monthly-format-payload.ts`
- `app/api/prospects/[id]/digest/subscribe/route.ts`
- `app/api/prospects/digests/route.ts`
- `app/api/prospects/digests/[draft_id]/approve/route.ts`
- `app/api/prospects/digests/[draft_id]/reject/route.ts`
- `app/api/prospects/digests/[draft_id]/preview/route.ts`
- `app/r/d/[event_id]/route.ts`
- `app/p/digest-unsubscribe/[token]/page.tsx`
- `app/api/p/digest-unsubscribe/[token]/route.ts`
- `app/api/cron/prospect-digest-build/route.ts`
- `app/api/webhooks/resend/route.ts`
- `app/admin/prospects/digests/page.tsx`
- `app/admin/prospects/digests/stats/page.tsx`
- `components/prospects/digest-subscription-toggle.tsx`
- `components/prospects/digest-telemetry-panel.tsx`
- `components/prospects/digest-approval-queue.tsx`
- `components/prospects/digest-preview-modal.tsx`
- `components/prospects/digest-stats-dashboard.tsx`
- `tests/integration/prospect-digest-build.test.ts`
- `tests/e2e/prospect-digest.spec.ts`

Edited files:
- `lib/supabase/types.ts` (regen)
- `app/admin/prospects/[id]/page.tsx` (mount Stickiness tab with subscription toggles + telemetry panel)
- `components/layout/admin-sidebar.tsx` (add Digests sub-entry under Prospects)
- `.env.example` (PROSPECT_DIGEST_FROM, RESEND_WEBHOOK_SECRET)
- `vercel.json` (cron `0 8 * * *` for build cron)

## Edge Cases

- Prospect converted between draft + send → mark draft expired; don't send.
- Prospect archived → mark draft expired.
- No alerts for weekly window → skip build (no empty digest).
- No format trend data for monthly → fall back to evergreen formats list; flag draft as "evergreen".
- LLM polish fails → fall back to templated subject + opening; flag draft `payload.polish_fallback=true`.
- Resend webhook delayed → events backfill out-of-order; UI sorts by occurred_at.
- Unsubscribe link clicked but token expired → still process (graceful); log digest_event kind='unsubscribed'.
- Bounce → set subscription.active=false; push admin notification.
- Complaint (spam flag) → set subscription.active=false + flag prospect; push admin urgent.
- Rapid double-approve (race) → DB unique on status transition: use `UPDATE ... WHERE status='drafted'` check rowcount.
- Reply-to sales rep no longer has email → fall back to `PROSPECT_DIGEST_FROM`.

## Verify Gates

- `npx tsc --noEmit`
- `npx vitest run lib/prospects/digest-builder.test.ts`
- `npx vitest run lib/prospects/digest-polish.test.ts`
- `npx vitest run lib/prospects/digest-template.test.ts`
- `npx vitest run tests/integration/prospect-digest-build.test.ts`
- Apply migration via Supabase MCP.
- Manual: subscribe a test prospect, run cron, approve, verify inbound + open + click + unsubscribe.
- E2E: `tests/e2e/prospect-digest.spec.ts`.
- `docs/email-style.md` audit checklist on template.

## Done When

- 1 month of digests sent for ≥5 real prospects (recorded in Notes).
- Open rate ≥30% measured (target 40%+).
- Zero accidental sends across the month.
- `docs/email-style.md` compliance verified in QA pass.
- Aggregate stats dashboard rendering correctly.
- Unsubscribe flow tested per-type + all-stop.
- Resend webhook events flowing; verified in events table.
- Cron registered in vercel.json + running daily.

## Dependencies (Cross-PRD)

- SPY-06 provides `prospect_monitor_alerts` for weekly digest highlights.
- SPY-09 provides presentation public link as primary CTA destination.
- SPY-04 provides scorecard share link as fallback CTA destination.
- VFF library provides format taxonomy for monthly digest.
- Existing Resend integration provides delivery + open tracking.
