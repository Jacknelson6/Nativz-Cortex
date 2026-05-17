# PRD: CUP · 02 · Ops notifications + preview link

> CUP / 02 · drafted 2026-05-16

## Purpose & Value

When an editor presses "I'm done" (CUP-01), the SMM has to find out. Today: Slack DM if the editor remembers, or radio silence. This PRD ships the dispatcher: in-app notification (default, always on) + optional Slack webhook + optional email digest, each with the preview link to the CUP-03 review surface.

The goal is "SMM gets pinged within 30 seconds, taps the link, lands on the review page on phone or laptop, can approve and send in one tap if the drop is clean."

## Problem

- No automatic signal exists when a drop moves to `smm_review`. The CUP-01 state change is silent.
- Existing notification plumbing (`lib/notifications.ts createNotification()` + `lib/social/zernio-webhook-notify.ts`) is built for publish failures and Zernio account errors; the schema is generic enough to reuse but the `type` enum needs an addition.
- The ops Slack channel does not have a webhook configured yet.
- We do not have a per-client routing concept for notifications. Today notifications either go to all admins or to a hardcoded `ZERNIO_WEBHOOK_NOTIFY_USER_IDS` list. CUP-02 introduces a small per-client SMM assignment so different clients can route to different reviewers (future-proof; today everything routes to Jack).

## Primary User

SMM / content officer (Jack today) who needs to be told the moment a drop is ready, with a one-tap path to the review page.

## SMART Goals

- Notification fires within 30 seconds of CUP-01's `editor → smm_review` transition.
- Notification dedup: at most one in-app + one Slack message per (drop, smm_review entry). Re-entry to `smm_review` after a rejection fires a new notification.
- Slack message is configurable per organization via env var (single-tenant today, ready for multi-tenant later).
- In-app notification opens to `/admin/calendar/review/[token]` (CUP-03), not the client share link.
- Failed Slack post does not block the in-app notification. Failed in-app notification logs but does not block the state transition.
- "Daily digest" mode (env-flag): batch all `smm_review` notifications into a 9am Slack digest instead of per-drop messages, for orgs that prefer that cadence. Off by default.

## User Stories

- **US-01** — As the SMM, I get a Slack message in the ops channel the moment a drop is ready, with client name, post count, date range, and a "Review" button.
- **US-02** — As the SMM on mobile, the Slack "Review" button opens directly to the CUP-03 review page (deep link, not a generic admin landing).
- **US-03** — As the SMM, the in-app bell icon shows a "1" for new drops awaiting review, and the dropdown lists them with the same one-tap link.
- **US-04** — As an org admin, I can disable Slack and rely on in-app only, or disable in-app and rely on Slack only.
- **US-05** — As a dev re-running the handoff route in dev, I do not spam the ops channel (dedup + dev env guard).
- **US-06** — As the SMM, when a drop gets re-submitted after my rejection, I get a new notification — not a silent re-entry.

## In Scope

- New notification type: `drop_smm_review_ready`.
- `lib/calendar/notify-smm-review.ts` — dispatcher that fires in-app + Slack + (optional) email.
- Slack webhook posting helper: `lib/social/slack-webhook.ts` (reusable beyond CUP; first caller is CUP-02 but the lib is generic).
- Env vars: `SLACK_OPS_WEBHOOK_URL`, `SLACK_OPS_WEBHOOK_ENABLED`, `SMM_REVIEW_DIGEST_MODE`.
- Per-client SMM routing: new column `clients.smm_reviewer_user_id uuid REFERENCES users(id) ON DELETE SET NULL`. Default null; falls back to `ZERNIO_WEBHOOK_NOTIFY_USER_IDS` list.
- Dedup: `content_drops.last_smm_review_notified_at timestamptz`.
- Cron route for digest mode: `app/api/cron/smm-review-digest/route.ts` (no-op when `SMM_REVIEW_DIGEST_MODE=off`).

## Out of Scope

- Email notifications beyond the digest mode. The SMM gets in-app + Slack; the digest mode is a Slack message, not an email.
- Push notifications to a mobile app (no mobile app today).
- Anything outside the "drop awaiting SMM review" surface (no notification for editor re-submits in this PRD; that is implicit via the same notification firing again).
- Per-user notification preferences UI. Reuses existing preferences if present; the new `type` slots into the existing preferences table.

## Resolved Decisions

- **D-01** — Slack or email primary? **→ Slack primary, in-app fallback, email opt-in digest.** Rationale: Jack's stated default channel is Slack ops. Email is too low-signal for "I need to review this now."
- **D-02** — One webhook for the whole company or one per organization? **→ One per organization, stored in env for now; if/when we go multi-tenant we promote to `organizations.slack_ops_webhook_url`.** Rationale: today single-tenant; keep simple, plan the upgrade path.
- **D-03** — Block on Slack failure? **→ No.** Rationale: Slack outage must not break the state machine. Log warning, fire in-app, move on.
- **D-04** — Dedup per state-entry or per drop forever? **→ Per state-entry.** Rationale: a rejection-then-re-submit is a legitimate new ask; the SMM should be re-pinged.
- **D-05** — Notification body links to CUP-03 review URL or to the client share link? **→ CUP-03 review URL.** Rationale: client share link is for clients; SMM gets admin overlay.
- **D-06** — How does the Slack message know the review URL when the share link has not been minted yet (per CUP-01 D-02)? **→ Use a drop-scoped review URL `/admin/calendar/review/drop/[id]` for the smm_review state, and switch to `/admin/calendar/review/[token]` once the share link is minted (i.e. after approval).** Rationale: the SMM is reviewing the drop, not a share link; the share link is an artifact of approving.
- **D-07** — Where does the Slack post get fired from? **→ Inline in the handoff route after the state write commits.** Rationale: same request, low latency; we accept that a crash between the DB write and the Slack post would lose the notification, but that is acceptable given the in-app notification is also written and the SMM can see the "awaiting" filter in the admin calendar.

## Data Model

### Migration 320_smm_review_routing.sql

```sql
-- Per-client SMM assignment (defaults to the global env list if null).
ALTER TABLE clients
  ADD COLUMN smm_reviewer_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- Dedup sentinel — bumped each time we fire the smm_review notification.
ALTER TABLE content_drops
  ADD COLUMN last_smm_review_notified_at timestamptz;

-- Add notification type. The notifications table uses a text column (not
-- an enum) per existing pattern; no enum migration needed. If the table is
-- enum-backed in your branch, add the enum value here.
-- (verified during CUP-01 build: lib/notifications.ts uses text type.)
```

## API Contracts

### POST /api/cron/smm-review-digest
Auth: `Authorization: Bearer ${CRON_SECRET}`.
Request: none.
Response (200):
```ts
{ digestSent: boolean; dropCount: number; orgCount: number }
```
Behaviour:
- No-op + return `{ digestSent: false, dropCount: 0, orgCount: 0 }` when `SMM_REVIEW_DIGEST_MODE !== 'on'`.
- Otherwise: query `content_drops where handoff_state = 'smm_review' and last_smm_review_notified_at >= now() - interval '24 hours'`. Group by org. Post one Slack message per org with a bulleted list of drops + review links. Update `last_smm_review_notified_at` to now() so per-drop dispatch does not re-fire.

Errors: 401 unauthorized, 500 server.

Schedule: daily at 09:00 local (`vercel.json` cron `0 14 * * *` for 09:00 CT in winter; check DST or just use a fixed UTC hour and document).

### Internal dispatcher (not an HTTP route): `notifySmmReviewReady`

```ts
// lib/calendar/notify-smm-review.ts
import { type SupabaseClient } from '@supabase/supabase-js';

export async function notifySmmReviewReady(
  admin: SupabaseClient,
  args: {
    dropId: string;
    actorUserId: string; // editor who pressed handoff
    note?: string;
  },
): Promise<{
  inAppNotified: number;
  slackPosted: boolean;
  slackError?: string;
}>;
```

Logic:
1. Load the drop + client + post count + scheduled date range.
2. Resolve recipient list: `client.smm_reviewer_user_id` if set, else parse `ZERNIO_WEBHOOK_NOTIFY_USER_IDS` env.
3. For each recipient, `createNotification({ user_id, type: 'drop_smm_review_ready', payload: { drop_id, client_name, post_count, date_range, review_url }, link: review_url })`.
4. If `SLACK_OPS_WEBHOOK_ENABLED === 'true'` and `SLACK_OPS_WEBHOOK_URL` is set and `SMM_REVIEW_DIGEST_MODE !== 'on'`: post to Slack via `postOpsSlack(payload)`.
5. Stamp `content_drops.last_smm_review_notified_at = now()`.
6. Return a small status object so the route can include it in its response body for debugging.

Idempotency: skip step 3–4 if `last_smm_review_notified_at` is within the last 60 seconds. This catches double-clicks on the editor button.

### Slack post helper: `postOpsSlack`

```ts
// lib/social/slack-webhook.ts
export async function postOpsSlack(payload: {
  webhookUrl: string;
  text: string;          // fallback for clients without block rendering
  blocks: SlackBlock[];  // typed Block Kit
}): Promise<{ ok: boolean; error?: string }>;
```

Block layout for CUP-02:

```
:clipboard: *New drop awaiting SMM review*
*Client:* Goodier Labs
*Posts:* 8 across 4 platforms
*Window:* May 20 to Jun 17
*Editor note:* "May posts ready, 3 of them use the new tube line b-roll."

[ Review on Cortex ]   ← button, links to /admin/calendar/review/drop/[id]
```

## LLM Prompts

None. This PRD is plumbing.

## UI Components

### `components/notifications/drop-smm-review-row.tsx`
Purpose: render the `drop_smm_review_ready` type in the in-app notification dropdown.
Props:
```ts
type Props = {
  notification: {
    id: string;
    created_at: string;
    payload: {
      drop_id: string;
      client_name: string;
      post_count: number;
      date_range: { start: string; end: string };
      review_url: string;
    };
    read_at: string | null;
  };
  onRead: (id: string) => void;
};
```
Layout: same shape as other notification rows. Bold client name, post count + date range as a secondary line, "Review" link styled with `accent-text`.
Copy:
- Title: "{client_name} — calendar ready for review"
- Body: "{post_count} posts, {month_short_date_range}"
- CTA: "Review"
States: unread (accent dot), read (muted).
Tokens: `bg-surface`, `accent-text`, `text-text-muted`.

## File Map

Create:
- `supabase/migrations/320_smm_review_routing.sql` - column adds.
- `lib/calendar/notify-smm-review.ts` — dispatcher.
- `lib/calendar/notify-smm-review.test.ts` — unit tests (mock supabase + slack fetch).
- `lib/social/slack-webhook.ts` — generic Slack post helper.
- `lib/social/slack-webhook.test.ts` — unit tests.
- `app/api/cron/smm-review-digest/route.ts` — digest cron.
- `components/notifications/drop-smm-review-row.tsx` — notification row renderer.

Modify:
- `app/api/calendar/drops/[id]/handoff/route.ts` (from CUP-01) — call `notifySmmReviewReady()` after the state write commits.
- `lib/notifications.ts` — add `'drop_smm_review_ready'` to the type union + default preferences.
- `components/notifications/notification-dropdown.tsx` (or current equivalent) — render the new row type via the renderer map.
- `vercel.json` — add the digest cron entry.
- `.env.example` — add the three new env vars.

## Env Vars

New:
- `SLACK_OPS_WEBHOOK_URL` — Slack incoming webhook URL for the ops channel.
- `SLACK_OPS_WEBHOOK_ENABLED` — `'true'` to enable; default off.
- `SMM_REVIEW_DIGEST_MODE` — `'on'` to enable daily 09:00 digest instead of per-drop messages; default `'off'`.

## Edge Cases

- **Slack webhook URL revoked / 401.** `postOpsSlack` returns `{ ok: false, error }`; dispatcher swallows + logs + still records the in-app notification.
- **Editor double-clicks the handoff button.** Second handoff route call returns 409 (CUP-01); even if it didn't, the dispatcher's 60-second idempotency window stops the duplicate Slack post.
- **Rejection → re-submit happens within 60 seconds.** Rare but real. Idempotency check uses `last_smm_review_notified_at`; on the second submission, the state machine is back to `smm_review` and the timestamp comparison is against the previous fire. To allow legitimate re-submits, also check that the most recent `handoff_history` entry is a fresh transition into `smm_review` — if so, bypass the dedup. Implement as: dedup ONLY when last notification fired AND state was already `smm_review` AND no rejection happened in between.
- **No recipients resolved (client has no SMM, env list empty).** Dispatcher returns `{ inAppNotified: 0, slackPosted: false }`. CUP-01 route logs a warning but does not 5xx — the SMM filter in the admin calendar is the fallback.
- **Dev env.** `SLACK_OPS_WEBHOOK_ENABLED !== 'true'` in dev by default, so no spam. In-app still fires (useful for testing).
- **Org with the digest mode on but a drop is genuinely urgent.** Out of scope; SMM can always view the admin calendar filter and act. If urgency becomes a real ask, add an "urgent" flag on handoff later.

## Test Plan

- Unit: `lib/calendar/notify-smm-review.test.ts` — happy path (in-app + Slack), Slack failure does not throw, dedup window honoured, dedup bypassed on rejection-then-resubmit.
- Unit: `lib/social/slack-webhook.test.ts` — payload shape, error mapping, no exception on non-2xx.
- Unit: `app/api/cron/smm-review-digest/route.test.ts` — off mode no-ops, on mode groups by org, stamps `last_smm_review_notified_at`.
- Integration: CUP-01's handoff route end-to-end + a recorded `fetch` mock confirms Slack was called with the right payload.
- Manual QA: real Slack webhook in dev, press handoff in dev, message lands in the dev ops channel, button deep-links into CUP-03.

## Architecture Wiring

`notifySmmReviewReady` lives next to the calendar code because the payload is calendar-shaped. The Slack helper is split out because it will be reused (Zernio webhook notifier, future approval queue, etc.). The notification type slots into the existing `notifications` table without schema change beyond the new column on `content_drops` + `clients`. Cron pattern follows existing `app/api/cron/<name>/route.ts` with `withCronTelemetry` and Bearer auth.

## Done When

- Migration 320 applied.
- Pressing handoff in dev fires an in-app notification.
- With env vars set, the same press fires a Slack message in the test channel.
- Slack message's "Review" button deep-links to `/admin/calendar/review/drop/[id]` (the CUP-03 page, shipped after this PRD or in parallel).
- Dedup verified: pressing handoff twice does not double-fire.
- Rejection-then-resubmit fires a fresh notification.
- Digest cron is no-op when env flag is off; in on mode it groups correctly.
- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- No em dash in any new copy.
