# PRD PUB-02: Post-Publish Round-Trip Verify

## Purpose & value

Zernio occasionally reports `published` for a leg the platform later silently rejected (IG content-type mismatch, TikTok shadow-removed, YT processing failure). The current pipeline trusts Zernio's status. We need an independent confirmation that the post actually exists on the platform.

## Problem

`scheduled_post_platforms.status = 'published'` today means "Zernio's API said success." That's the floor, not the ceiling — the platform's own API is the ground truth. Without a verification pass, a post that was rejected by the platform leaves no trace in our system and no signal to Jack.

## Primary user

Backend verify cron. No UI surface in this PRD (PUB-05 will read the same data for the dashboard).

## SMART goals

- 100% of legs marked `published` get a verification probe within 30 minutes of publish
- ≥98% of platform rejects detected within 1 hour
- Flag rate < 2% false positives (don't ping Jack when the platform just hasn't indexed yet)

## User story

> As Jack, when Instagram silently rejects a Reel that Zernio thinks it published, I want a chat ping with the post detail link, so I can investigate, not learn about it 4 days later from the client.

## In scope

- New cron `app/api/cron/verify-published-posts/route.ts`, runs every 10 minutes.
- Claims rows from `scheduled_post_platforms` where `status = 'published'` AND `last_verified_at IS NULL` AND `published_at > now() - 24h`.
- Per leg, calls the platform-appropriate Zernio retrieval endpoint to confirm post exists + has expected content (`getPostStatus(latePostId)` if present; otherwise a per-platform lookup).
- If verified: stamp `last_verified_at = now()`, `verification_status = 'confirmed'`.
- If platform reports the post missing/rejected/removed: stamp `verification_status = 'platform_reject'`, write `verification_detail` to `failure_reason`, fire chat alert via existing `notifyPartialFailure` path with new "platform_reject" subtitle.
- Pending/unknown response: leave `last_verified_at` null, retry next tick (max 6 attempts over 1h, then mark `verification_status = 'unverifiable'` without alerting — the platform's API was the issue, not the post).

## Out of scope

- Verifying post performance / engagement (PUB-05 + existing analytics covers)
- Re-publishing a verified-rejected post (manual decision; chat ping has retry button)
- Verifying scheduled_posts that have never been published (covered by existing cron)

## Architecture wiring

- New columns on `scheduled_post_platforms` (migration):
  - `last_verified_at timestamptz`
  - `verification_status text check (in 'pending', 'confirmed', 'platform_reject', 'unverifiable')`
  - `verification_detail text`
  - `verification_attempts integer default 0`
- New cron `/api/cron/verify-published-posts/route.ts` with `withCronTelemetry` wrapper, runs `*/10 * * * *`.
- New method `lib/posting/zernio.ts:verifyPostOnPlatform(latePostId, platform)` → `{ exists: boolean, content_matches: boolean, raw: ... }`. For each core-four it uses the most reliable available endpoint:
  - TikTok: `/posts/{id}` Zernio retrieval (Zernio polls TikTok for us)
  - Instagram: same via Zernio; fallback to IG Graph API if we hit a "missing" response
  - YouTube: same via Zernio
  - Facebook: same via Zernio
- Chat notification: reuses `notifyPartialFailure` card with header changed to `❌ Post rejected by platform` when verification flips to `platform_reject`.
- Vercel cron entry in `vercel.json` (or `vercel.ts`).

## Open questions

- Verification window: 30min minimum delay (IG indexing latency), 24h maximum (anything older is stale enough that we'd act manually). Confirm 30/24 is right after first week of data.
- Per-platform retrieval reliability: do we need a per-platform adapter or is Zernio's `/posts/{id}` reliable enough as a single source? Default: single source first; carve out per-platform fallback only if rejection rate is wrong.

## Assumptions

- Zernio's `/posts/{id}` returns the platform's view, not Zernio's stored copy. (Verify on first implementation.)
- 24h verification window covers normal platform delays; anything older is stale enough that we don't bother.

## Done when

- Migration applied with the new columns.
- Verify cron runs every 10 min, claims pending verifications via CAS, never double-verifies.
- A leg that gets `platform_reject` triggers one chat alert with retry button.
- Existing analytics / share-link UI either ignores the new column (forward-compat) or surfaces the new state (PUB-05 wires it in).
- Typecheck + lint clean. Committed on main.
