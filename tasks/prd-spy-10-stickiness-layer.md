# PRD: Spying → Prospect Pipeline, Phase 10 — Stickiness & Post-Demo Touchpoints

> Series: Spying / Prospect Pipeline · 10/10 · Draft 2026-05-10

## Purpose & Value

Most prospects don't sign on the first call. They need 5-12 touchpoints across 30-90 days. This phase automates the warm-touchpoint layer — weekly competitor digests, monthly format reports — that keeps the brand in front of the prospect without manual sales rep effort.

## Problem

Sales reps can't manually email 30 prospects weekly with bespoke insights. Without a stickiness mechanism, prospects ghost. With one, the agency demonstrates ongoing value before the prospect has paid a dollar — which is the rankprompt.com playbook.

## Primary User

Prospect (passive consumer of digests). Sales rep (configures + reviews engagement).

## Goals (SMART)

- ≥40% of prospects who receive a digest open it (industry benchmark for opted-in emails).
- ≥10% of digests result in a click-through to the prospect's record on Cortex (lightweight signal of engagement).
- 100% of digests are auto-generated; sales rep approves with one click before send.
- Zero accidental sends (per `feedback_no_autonomous_email_send.md` — always draft + manual confirm).

## User Stories

- **US-01** — As a sales rep, on each prospect's record I can toggle "Send weekly competitor digest" with a starting date.
- **US-02** — As a sales rep, every Monday morning I see a queue of drafted digests for my prospects with a "Send" button per row (never auto-send).
- **US-03** — As a prospect, I receive a clean, branded email summarizing what changed in my competitor landscape this week and a CTA to "See the full report on Cortex."
- **US-04** — As a sales rep, I see open + click telemetry per digest on the prospect's record.

## In Scope

- Digest types:
  - **Weekly competitor digest** — 3 highlights from SPY-06 alerts for the past 7 days.
  - **Monthly format report** — top 5 formats trending in the prospect's niche (pulled from VFF library, brand-scoped).
- Digest builder: `lib/prospects/digest-builder.ts` produces a `Draft` (subject + HTML body) per prospect per cadence.
- Approval queue UI: `/admin/prospects/digests` lists drafted-but-not-sent digests with preview + Send button.
- Email delivery: Resend (existing, used by users-page email composer per `docs/superpowers/specs/2026-04-13-users-page-email-design.md`).
- Tracking:
  - Open via Resend's open tracking.
  - Click via internal tracker route that 302s to destination + logs.
- Compliance: every digest has unsubscribe link + clearly identifies sender.

## Out of Scope

- Auto-send without sales rep approval (forbidden per memory rule).
- A/B testing subject lines (defer).
- Prospect reply parsing / threading (manual handling v1).
- SMS / WhatsApp digests (email-only v1).

## Architecture Wiring

- Reuses Resend integration (per existing email composer).
- Reuses approval-then-send pattern (per `feedback_no_autonomous_email_send.md`).
- Reads from SPY-06 alerts + VFF library.
- Telemetry rows: `prospect_digest_events` (digest_id, kind enum: `sent` | `opened` | `clicked` | `unsubscribed`, occurred_at).
- Branded email template per `docs/email-style.md` (referenced in CLAUDE.md as required pre-read).

## Open Questions

1. Frequency cap: max one digest per prospect per week even when both weekly + monthly would fire same day? (Default: yes, weekly takes precedence.)
2. Unsubscribe granularity: per-digest type, or all-or-nothing? (Default: per-type to maximize retention.)
3. Allow the prospect to reply to the digest and route into the sales rep's inbox? (Default: yes, Reply-To is the sales rep's address; no special handling.)

## Assumptions

- Prospects have opted into receiving these digests at SPY-04 share-link time (need to confirm CAN-SPAM / GDPR posture).
- Resend volume + cost is fine for ~500 emails/week.
- Sales reps will use the approval queue daily (if not, the digest engine throttles).

## Done When

- 1 month of digests sent for 5 real prospects.
- Open rate ≥30% (lower-bound target; healthy is 40%+).
- Zero accidental sends.
- `docs/email-style.md` compliance verified in QA pass.
