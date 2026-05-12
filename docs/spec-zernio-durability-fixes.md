# Zernio Durability Fixes

Investigation source: end-to-end Zernio flow audit on 2026-05-12.

The publish pipeline is well-defended (atomic CAS claim, approval gate, two-pass token check, per-leg retry, dupe guard, webhook idempotency). The weak spots are all on the **status reconciliation** side: webhook + cron can double-notify, multiple notify paths diverge over time, no SLO tells us "did this actually publish on time," and there's no audit trail when `late_post_id` rotates on retry.

This doc is the punch list. Each fix is independently shippable.

---

## Fix 1 — Webhook `post.failed` notify dedup

**Problem:** Both `app/api/scheduler/webhooks/route.ts:230` (unconditional) and `app/api/cron/reconcile-zernio/route.ts:204` (guarded by `transitionedToFail`) call `notifyZernioWebhookRecipients`. If the webhook fires AND the daily cron also detects the same fail, ops gets two emails. The reconciler's guard isn't bulletproof either: a webhook arriving between the cron's `beforeStatus` snapshot and re-fetch will slip through.

**Fix:** Mirror the `publish-posts` cron pattern. Add a `failure_notification_sent_at` check in the webhook handler before sending the `post.failed` email. Stamp the column when sent. Daily reconciler does the same check before its own send.

**Files:**
- `app/api/scheduler/webhooks/route.ts:187-238` — gate the notify call
- `app/api/cron/reconcile-zernio/route.ts:204-216` — gate the notify call
- Both stamp `failure_notification_sent_at` on send

**Acceptance:** Two consecutive `post.failed` events for the same `late_post_id` produce exactly one email. Webhook + cron both detecting the same fail produce exactly one email. Caption-edit + republish that fails clears the stamp (already done at `publish-posts:1088`) so a fresh failure can re-page.

---

## Fix 2 — Stuck-`publishing` alert

**Problem:** `publish-posts` flips a row to `'publishing'` via CAS, then calls Zernio. If the process is killed mid-call (OOM, Vercel timeout, hung HTTP), the row stays `'publishing'` forever. The next cron tick's SELECT does include `'publishing'` and the CAS re-claims it, so it self-heals on retry. But if it crashes repeatedly (deterministic payload bug, Zernio outage), there's no alert.

**Fix:** Add a "stuck in `publishing` > N minutes" check to `verify-published-posts`. Threshold: `scheduled_at + 15min` (the cron runs every 2min, so anything older than 15min has had 7+ chances). Fire a one-shot Google Chat alert per stuck row, dedup via a new `stuck_publishing_alerted_at` column or by reusing `failure_notification_sent_at`.

**Files:**
- `app/api/cron/verify-published-posts/route.ts` — add scan
- Migration: `stuck_publishing_alerted_at timestamptz null` on `scheduled_posts`

**Acceptance:** A row stuck `publishing` for >15min triggers exactly one Chat alert until the cron either succeeds or gives up. Self-heal on next successful publish clears the stamp.

---

## Fix 3 — `post.scheduled` webhook syncs SPP rows

**Problem:** `app/api/scheduler/webhooks/route.ts:240-262` writes only `status='scheduled'` on the parent. Per-leg `scheduled_post_platforms` rows stay stale until another event arrives. Inconsistent with how `post.published`/`post.failed` handle it (both call `syncPlatformRowsFromZernio` + `reconcileParentStatusFromSpp`).

**Fix:** Call `syncPlatformRowsFromZernio` after the downgrade guard, then reconcile parent. Skip if parent is already terminal (`published`/`partially_failed`/`failed`).

**Files:**
- `app/api/scheduler/webhooks/route.ts:240-262`

**Acceptance:** A `post.scheduled` event for a non-terminal post syncs per-leg state from Zernio's truth.

---

## Fix 4 — Preserve `late_post_id` history on retry rotation

**Problem:** When a partial-fail retry creates a new Zernio post (`publish-posts:1051,1068`), the new ID overwrites the old. Already-published legs keep their `external_post_url` on the spp row, so they're not lost. But webhooks for the OLD `late_post_id` arrive after rotation and match no parent row, so they're silently dropped. The historical audit trail is gone — you can't replay "what did Zernio say at attempt 1?"

**Fix:** New table `scheduled_post_late_ids` (post_id, late_post_id, created_at, retired_at). On every `late_post_id` write, INSERT a row. On rotation, UPDATE the prior row's `retired_at`. Webhook handler does a join: look up the active or retired late_post_id and update the right parent.

**Files:**
- Migration: new `scheduled_post_late_ids` table
- `app/api/cron/publish-posts/route.ts:1035,1051,1068,1083,520-528` — write history on every late_post_id mutation
- `app/api/scheduler/webhooks/route.ts` — fallback lookup via history table if direct match fails
- `lib/posting/zernio-reconcile.ts:22-30` — same fallback

**Acceptance:** A retry-rotated post receives a webhook for its old `late_post_id` and still routes to the correct parent. History table records every attempt for forensics.

---

## Fix 5 — Alert on `getPostStatus` 404

**Problem:** When the daily reconciler calls `service.getPostStatus(latePostId)` and Zernio 404s (post genuinely vanished), we `continue` past it (`app/api/cron/reconcile-zernio/route.ts:93`). No alert. Low probability but unbounded silence — if Zernio prunes a post we still think is live, we'll never know.

**Fix:** When `getPostStatus` returns null AND the parent isn't already terminal, fire a Chat alert. Dedup via a new column or by reusing the failure stamp. If parent is `published`/`failed`/`partially_failed`, the 404 is expected (Zernio cleaned up old terminal posts).

**Files:**
- `app/api/cron/reconcile-zernio/route.ts:88-95`

**Acceptance:** A non-terminal parent whose Zernio record 404s produces exactly one Chat alert per incident.

---

## Fix 6 — Unify three notify paths

**Problem:** Three notify entrypoints diverge over time: `notifyZernioWebhookRecipients`, `notifyConnectionExpired`, `notifyPartialFailureGuarded`. Different message formats, different dedup mechanisms (`failure_notification_sent_at`, `disconnect_alerted_at`, none).

**Fix:** New `lib/social/zernio-notify.ts` with one `notifyZernio({ kind, postId?, profileId?, ... })` function. Routes to the right channel (Chat / email / in-app) based on `kind` and consults a single dedup table `zernio_notifications_sent (kind, target_id, sent_at)`. Old helpers become thin wrappers for now (no big bang), but new code uses the unified entrypoint.

**Files:**
- New: `lib/social/zernio-notify.ts`, migration for `zernio_notifications_sent`
- Refactor: existing three helpers call into the new path

**Acceptance:** All Zernio notifications go through one function. Dedup is consistent. Easy to add a new notification type without inventing a new dedup mechanism.

**Priority:** Lower (cleanup, not a bug fix). Ship after 1-5.

---

## Fix 7 — Daily SLO roll-up

**Problem:** No metric answers "what % of scheduled posts published on time last week?" Cron telemetry exists but measures cron success, not business outcomes.

**Fix:** New cron `publish-slo-rollup` (daily 1am). Computes: for the prior 24h window, what % of posts whose `scheduled_at` fell in that window reached `published` status by `scheduled_at + 5min`. Writes to a new `publish_slo_daily` table. Surface on `/admin/nerd/` as a sparkline.

**Files:**
- Migration: `publish_slo_daily` table
- New: `app/api/cron/publish-slo-rollup/route.ts`
- New: `app/admin/nerd/components/publish-slo-card.tsx`
- `vercel.json` — register cron at `0 1 * * *`

**Acceptance:** Cards on `/admin/nerd/` show 7-day and 30-day SLO. Drilldown lists the posts that missed.

**Priority:** Lower (no bug to fix, but high-leverage visibility).

---

## Rollout order

1. Fix 1 (15 min) — kill double-email
2. Fix 2 (45 min) — stuck-publishing alert
3. Fix 3 (15 min) — webhook spp sync
4. Fix 5 (20 min) — 404 alert
5. Fix 4 (90 min) — late_post_id history
6. Fix 6 (2h) — unified notify
7. Fix 7 (90 min) — SLO roll-up

Each fix: implement → typecheck → lint → commit to main. No feature branches per project preference.
