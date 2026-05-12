# PRD PUB-01: Pre-Publish Token Health Gate

## Purpose & value

Catch broken tokens *at the moment of publish*, not the moment after. Every avoided partial-fail is one less false-alarm chat ping and one less client whose post landed late.

## Problem

The publish cron's pre-flight check reads `social_profiles.token_status` which is refreshed once daily by `connection-expired-watch`. That can be ~23h stale. A token that died at 3am will sail through the 2pm publish attempt, hit Zernio, get rejected per-leg, and land as `partially_failed` → 30 min retry → eventual exhaustion. Catching it before the publish call would let us:

- Stamp the leg `failed` with a clear `Token expired at publish time — reconnect required` reason
- Skip the retry cycle entirely (won't fix itself)
- Fire the existing connection-expired chat card immediately, so Jack sees the issue at post time, not 1.5 hours later after retries exhaust

## Primary user

Backend publish cron. No UI surface.

## SMART goals

- Reduce avg `partially_failed → exhaustion` time from ~1.5h to <2 min for token-related leg failures
- 100% of token failures classified `token_dead_at_publish` instead of `partially_failed` in the per-leg `failure_reason`
- Zero impact on happy-path latency (probe runs in parallel with media resolution, off the critical path)

## User story

> As Jack, when a client's YouTube token dies overnight, I want to know about it the second the cron tries to publish, not after three 30-min retry cycles, so I can hand-send the reconnect invite before the post slot slips.

## In scope

- New helper `lib/posting/check-publish-readiness.ts` that wraps `getAccountHealth` with an in-memory 90-second cache (multiple legs in the same cron run reuse the probe)
- Publish cron calls the helper for each leg right before `publishPost`
- If health says bad, the leg is stamped `failed` with `token_dead_at_publish` reason, no retry
- After all legs in a post are evaluated, if at least one was tagged `token_dead_at_publish`, fire the existing connection-expired-watch alert path directly (one ping per client, not per leg)
- Stamp `social_profiles.token_status = 'expired'` and `disconnect_alerted_at` so the daily watcher doesn't re-ping for the same incident

## Out of scope

- Pre-flight for non-token failure modes (caption length, media format) — Zernio's own validator already covers
- Pre-flight on bulk publish endpoint — same cron path will catch it on the first scheduled tick
- Auto-reconnect (tokens can't refresh themselves; this is by design)

## Architecture wiring

- `lib/posting/check-publish-readiness.ts` (new): `checkLegReadiness(accountId)` → `{ ready: boolean, reason?: string, healthSnapshot: ... }`. 90s LRU cache keyed on accountId.
- `app/api/cron/publish-posts/route.ts`: inside the per-leg loop, call `checkLegReadiness` right before `publishPost`. On `!ready`, skip publish, write `scheduled_post_platforms.status = 'failed'` + `failure_reason = 'Token dead at publish (was: <reason>). Reconnect required.'`. Increment a `tokenDeadCount` for the post.
- After per-post loop, if `tokenDeadCount > 0`, call the existing `notifyConnectionExpired` path with the affected platforms. Reuse the chat card from `connection-expired-watch`.
- `social_profiles` writes: `token_status`, `disconnect_alerted_at` (only if currently null, to dedup against the daily cron).

## Open questions

- Should the helper probe in parallel with media-resolve to hide the latency? (Default: yes — `Promise.all`.)
- 90s cache TTL: short enough to catch a token that dies between two legs in the same run; long enough that a 5-post burst for one client only probes once per platform. Confirm 90s is the right number after first observation.

## Assumptions

- `getAccountHealth` rate limits aren't an issue at current volume (~100s of legs/day → ~100s of probes max, well under Zernio's quota).
- The existing chat card from `connection-expired-watch` is already wired to the right webhook per client; reusing it is one import, not a new template.

## Done when

- New helper lands with tests for cache hit/miss + reset on TTL.
- Publish cron uses the helper before every `publishPost` call.
- A leg whose token is dead at publish time stamps `failed` immediately, no retry queue.
- Connection-expired chat card fires once per affected client per cron run.
- Typecheck + lint clean. Committed on main.
