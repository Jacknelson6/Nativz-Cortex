# PRD PUB-03: Daily Core-Four Delivery Audit

## Purpose & value

The failsafe. If everything else in the pipeline goes silent, this cron is the one that wakes Jack up. It does the simplest possible job: every day at the end of the day, sweep every active client, check that each scheduled core-four post for that day actually shipped. If anything didn't, fire a single rolled-up chat card.

## Problem

Today, when a post lands at `partially_failed` and exhausts `retry_count = MAX_RETRIES`, the partial-failure card fires once and then the post goes silent forever. Same for any leg with `verification_status = 'platform_reject'` (PUB-02) — fires once. If Jack misses the ping, he misses the failure permanently. Worse: a post that for some reason never even hits the cron (status stuck at `scheduled`, `scheduled_at` in the past, nothing claimed it) has zero alerting today.

Per Jack: **"I NEED to know if the core four platforms are not being posted to by clients."**

## Primary user

Jack, every morning, scanning a single chat card to know if yesterday shipped clean across all brands.

## SMART goals

- Zero scheduled core-four legs go silently dead per day (every miss surfaces in the audit)
- One audit card per agency-wide run, not one per client (digest, not noise)
- Audit cron is idempotent — re-running same day produces same card (no dedup spam)
- Card delivered by 8am ET (cron runs 6am UTC = 1-2am ET = morning surface for Jack)

## User story

> As Jack, when I wake up, I want one card in Ops Chat that says either "All 27 core-four legs shipped yesterday across 9 clients" or "3 legs missed yesterday: Coast to Coast YT, EcoView IG, Anderson FB — click to triage." So I know in 5 seconds whether I need to act.

## In scope

- New cron `app/api/cron/core-four-audit/route.ts`, runs `0 6 * * *` UTC (~1am ET / 2am EST).
- Query window: previous 24h (00:00–23:59 UTC of yesterday).
- For every `scheduled_posts` row whose `scheduled_at` falls in window, group its `scheduled_post_platforms` legs into core-four buckets (TikTok / Instagram / YouTube / Facebook). Non-core legs are ignored for the alert threshold but counted in the digest tail.
- A leg counts as "shipped clean" if `status = 'published'` AND (`verification_status IN ('confirmed', NULL)` — `NULL` for backward compat before PUB-02 lands).
- Anything else (status `failed`, `partially_failed`, `scheduled`, `publishing`; verification `platform_reject`, `unverifiable`) is a miss.
- Build one chat card per agency (Nativz, Anderson Collaborative) — agencies post to different webhooks per existing `resolveTeamChatWebhook` logic, but Ops Chat is single webhook → all rolled into one.
- Card body groups misses by client → platform with a one-line reason and a deep-link to the post in `/admin/calendar/[post-id]`.
- If zero misses, still fire a "✅ Core four shipped clean yesterday: N legs / M clients" card. Daily heartbeat lets Jack know the cron itself is alive.

## Out of scope

- Detecting that a client *should have had* a post scheduled but didn't — that's a content-calendar gap, separate problem.
- Retrying failed legs — out of scope; this audit only surfaces, doesn't act. Manual retry button in chat card opens `/admin/calendar`.
- Per-client per-day audits to clients themselves — internal only.

## Architecture wiring

- `app/api/cron/core-four-audit/route.ts` (new): `withCronTelemetry` wrapped, `Bearer CRON_SECRET` auth.
- Query: `scheduled_posts` joined to `scheduled_post_platforms` joined to `clients` for active clients only (no soft-deleted), `scheduled_at` in `[yesterday_start, yesterday_end]` UTC.
- Bucket every leg into `{published, failed, in_flight}` based on `status` + `verification_status`.
- Build digest object per agency, render Google Chat `cardsV2` card via `buildChatCardMessage`.
- Card buttons: "Open calendar" → `/admin/calendar?date=<yyyy-mm-dd>`. Per-miss line links to `/admin/calendar/{post_id}`.
- Constants:
  - `CORE_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'facebook'] as const`
  - Shared with PUB-04 + PUB-05; pull into `lib/posting/core-platforms.ts`.
- Card header copy:
  - Misses present: `🚨 Core four delivery: N misses yesterday`
  - All clean: `✅ Core four delivery: all N legs shipped`
- vercel cron entry.

## Open questions

- Should the audit also flag `partially_failed` posts that *still have retries left* and might recover today? Default: no — they'll either succeed before the next audit run or land in tomorrow's window. Reduce noise.
- Time zone: yesterday in UTC vs the client's local TZ? UTC for v1 — simplest. Add TZ awareness if Jack complains about boundary cases.

## Assumptions

- `scheduled_at` is the source of truth for "this post was supposed to ship on this day."
- `scheduled_post_platforms.status` is reliably updated by the publish cron (it is, per existing code).
- One chat webhook to Ops Chat is fine for v1; if individual brand chats start asking for their own daily, fan out then.

## Done when

- Cron runs at 6am UTC and produces a card every day.
- Card shows ✅ on clean days and 🚨 with miss list on dirty days.
- Re-running the cron the same day produces a no-op (idempotent: only fires card if not yet sent for that window — track via `cron_runs` table or a small `core_four_audit_runs` shadow table).
- Constants extracted to `lib/posting/core-platforms.ts`.
- Typecheck + lint clean. Committed on main.
