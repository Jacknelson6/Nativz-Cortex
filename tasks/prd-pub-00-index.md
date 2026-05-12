# PRD Batch: Zernio Publish Reliability, 2026-05-11

> 5 PRDs to harden the publish pipeline so every post either ships, or Jack hears about it loud enough to fix it.

## Why this batch exists

Recent incidents (EcoView YouTube `needs_refresh`, Coast to Coast TikTok / YouTube false-positive pre-expiry pings) surfaced two problems:

1. The connection-expired-watch cron sometimes pinged Jack about tokens that Zernio auto-refreshed milliseconds later. (Fixed in `ae14d531`.)
2. The publish cron does eventually fail and ping on partial publishes, but there is no end-of-day "did every client's core four actually go out today?" check. A post that gets stuck at `partially_failed` with `retry_count = MAX_RETRIES` produces one ping at the moment of exhaustion and then goes silent.

Jack's hard requirement, verbatim:

> I NEED to know if the core four platforms are not being posted to by clients.

The core four are **TikTok, Instagram, YouTube, Facebook**. The pipeline already supports LinkedIn / Google Business / Pinterest / X / Threads / Bluesky; those are not in scope for the "must alert" guarantee but ride along free wherever it doesn't cost extra plumbing.

## What's already in place (not changing)

- `app/api/cron/publish-posts/route.ts` runs every 2 min, claims rows via CAS, MAX_RETRIES=3, RETRY_DELAY_MS=30 min, retries only failed legs.
- Pre-flight Zernio validation rejects bad payloads before they hit `/posts`.
- `lib/calendar/notify-partial-failure.ts` deduped Google Chat card on partial fail.
- `app/api/cron/connection-expired-watch/route.ts` (now with double-probe + no pre-expiry pings) flags broken tokens daily.

## What's missing (this batch fixes)

| Gap | PRD |
|---|---|
| Cached `token_status` can lie at publish time; no hot-probe before each leg | PUB-01 |
| Zernio sometimes reports success on legs the platform actually rejected | PUB-02 |
| Exhausted `partially_failed` posts go silent after the first ping | PUB-03 |
| No independent canary that the pipeline + each platform is alive | PUB-04 |
| No daily roll-up so Jack can eyeball pipeline health in 5 seconds | PUB-05 |

## File map

- `prd-pub-01-prepublish-health-gate.md` — Hot token probe + smarter retry classification before each leg's publish call.
- `prd-pub-02-postpublish-verify.md` — Round-trip verify a post actually exists on each platform within N minutes of Zernio reporting success.
- `prd-pub-03-core-four-delivery-audit.md` — End-of-day cron: every client's scheduled core-four posts shipped, or Jack gets paged.
- `prd-pub-04-synthetic-smoke-test.md` — Synthetic publish on a Nativz-owned test account per platform every 6h.
- `prd-pub-05-publish-health-ops.md` — `/admin/ops/publish-health` dashboard + morning digest email.

## Build order

Sequential, each with its own typecheck + lint + commit gate. Ralph-loop without pausing for approval at the seams.

1. PUB-03 first — biggest behavior change for the stated goal. The daily audit is the failsafe that catches everything else.
2. PUB-01 — cheapest reliability gain, reduces the number of failures PUB-03 will have to surface.
3. PUB-02 — catches silent-success cases that PUB-01 can't predict.
4. PUB-04 — pipeline canary, independent of any client.
5. PUB-05 — observability skin over the rest.

## Done when

- Every client with active Zernio connections gets either a clean publish or a chat ping per missed core-four leg, every single day.
- A morning digest summarizes the previous 24h.
- The synthetic canary confirms each of TT / IG / YT / FB pipelines hourly enough that a platform-side outage gets caught before client posts start failing.
