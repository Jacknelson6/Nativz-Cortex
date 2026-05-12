# PRD PUB-04: Synthetic Publish Smoke Test

## Purpose & value

An independent canary that the publishing pipeline + each platform's API are alive, without waiting for a real client post to fail. If TikTok's API has an outage at 3am, we want to know at 3:01am, not when EcoView's 7am post lands as `partially_failed`.

## Problem

All current health signals are reactive — they fire when a real client post fails. If Zernio degrades, the platform API breaks, or our worker stops claiming rows for some reason, the next signal is a real client post failing. Synthetic canaries give us a leading indicator decoupled from client volume.

## Primary user

Backend ops. Jack glances at the canary dashboard (PUB-05) once a week to make sure the dot is green.

## SMART goals

- 4 canary posts per platform per day (every 6h)
- 100% of failures surface to Ops Chat within 10 minutes of the failed canary
- ≥98% canary success rate (anything lower = real platform / pipeline degradation worth investigating)

## User story

> As Jack, when TikTok's API has a global hiccup, I want to know about it from a canary that runs on our test account, not from a client whose Reel slot just slipped, so I can warn the team / clients before the failures start.

## In scope

- Nativz-owned test account per platform (already exists for some — confirm coverage with Jack on Day 1 of build). The accounts post to a private feed or test channel where nobody sees the content.
- New cron `app/api/cron/synthetic-publish-canary/route.ts`, runs every 6h.
- Each tick: for each of the four platforms, schedule one synthetic post via the same Zernio path real posts use. Content is a static "Cortex canary <timestamp>" caption + a shared evergreen 3-sec MP4 stored on Mux.
- Wait for the publish cron to claim and publish it (same retry rules as real posts; the canary is exactly the same code path).
- Verify via PUB-02's `verifyPostOnPlatform` 30 min later.
- If publish fails OR verify fails: fire chat alert with `🚨 Canary failed: <platform>` + last 200 chars of error.
- Delete the synthetic post from the platform immediately after verification succeeds (or leave forever if delete fails; not critical).
- Persist canary runs to a small `synthetic_publish_canaries` table for trend reading in PUB-05.

## Out of scope

- Canaries for non-core-four platforms (can add later)
- Canary alerts for transient (single-tick) failures — require 2 consecutive fails before alerting, to avoid noise from genuine 15-min platform blips
- Auto-creating the test accounts (one-time manual setup; PRD documents which handles to use)

## Architecture wiring

- New table `synthetic_publish_canaries`:
  - `id uuid primary key`
  - `platform text`
  - `scheduled_at timestamptz`
  - `late_post_id text nullable`
  - `publish_status text` (`pending`, `published`, `failed`)
  - `publish_error text nullable`
  - `verified_at timestamptz nullable`
  - `verification_status text nullable` (mirrors PUB-02)
  - `deleted_at timestamptz nullable`
- New cron `/api/cron/synthetic-publish-canary/route.ts`, schedules + retrieves canary statuses.
- Test accounts in `social_profiles` with `is_canary_account = true` boolean (new column on `social_profiles` migration; or simpler, a hardcoded array of `late_account_id` values in the cron). Default: hardcoded array, swap to column if scaling.
- Shared canary media: Mux asset id stored in env `CORTEX_CANARY_MUX_ASSET_ID`.
- Alert path: same `notifyConnectionExpired`-style card but with `🚨 Pipeline canary failed: <platform>` header.

## Open questions

- Do the test accounts already exist? Audit on Day 1 of build. If not, document required setup per platform in `docs/canary-setup.md` and have Jack create accounts.
- Delete-after-success: most platforms allow auto-delete via API. Confirm per platform.
- Cost: 4 platforms × 4 posts/day × 30 days = 480 synthetic Zernio publishes/month. Confirm this is in Zernio quota.

## Assumptions

- Synthetic posts on private/test accounts don't violate platform ToS (they don't — they're real posts on real accounts under Nativz control).
- A single shared canary MP4 is fine; we don't need per-platform aspect tweaks (3-sec 9:16 vertical works everywhere).

## Done when

- Canary cron runs every 6h, posts to all 4 platforms, verifies 30 min later.
- A canary failure surfaces in Ops Chat with platform + error within 10 min of the failure.
- `synthetic_publish_canaries` table backfilled from cron runs.
- Two consecutive failures trigger a "platform may be degraded" escalated card.
- Typecheck + lint clean. Committed on main.
