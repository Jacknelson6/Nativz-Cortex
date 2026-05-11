# PRD: Spying → Prospect Pipeline, Phase 07 — Prospect to Client Conversion

> Series: Spying / Prospect Pipeline · 07/10 · Draft 2026-05-10

## Purpose & Value

The moment a prospect signs. Preserve continuity: audits, competitor benchmarks, monitor history, scorecard, alerts — all of it stays connected to the new client record so the strategist isn't starting from scratch on day one.

## Problem

Without an explicit conversion flow, signing a deal means "create a new client manually + lose all prospect context" or "leave the data in the prospects table awkwardly." Neither honors the work the sales rep already did.

## Primary User

Sales rep + strategist at signing time. The strategist who picks up the new account week one.

## Goals (SMART)

- Conversion is a single button click on a prospect record.
- 100% of prospect history (audits, benchmarks, alerts, scorecard) becomes queryable from the new client record.
- New client onboarding kit (org, user invite, default settings) is created in <30s.
- Zero data loss; zero broken references.

## User Stories

- **US-01** — As a sales rep, I click "Convert to client" on a prospect, fill in org name + primary contact email + tier, and the system creates the client + organization + invite in one flow.
- **US-02** — As a strategist on day one with the new client, I open the client record and see a "From prospecting" panel summarizing: original audit date, scorecard, competitor benchmarks, alert history.
- **US-03** — As a developer, every prospect-side row that referenced `prospect_id` now also has a query path via `clients.converted_from_prospect_id`.
- **US-04** — As an admin, conversion fires the activity log + push notification ("Nike just converted").

## In Scope

- Conversion API: `POST /api/prospects/[id]/convert` taking org_name, contact_email, tier (optional), notes.
- Client + organization create flow:
  - Create `organization` row.
  - Create `client` row with `converted_from_prospect_id` FK.
  - Create `user_client_access` rows for default team members.
  - Mint invite token for primary contact (existing `invite_tokens` flow).
- Data linkage: history queries on the client record join through prospect.
  - `prospect_audits` → still queryable.
  - `prospect_competitor_benchmarks` → still queryable.
  - `prospect_monitor_alerts` → still queryable.
- "From prospecting" panel on `/admin/clients/[id]`: summary of prospect-era data with link-throughs.
- Prospect stage auto-flips to `converted` + `converted_to_client_id` FK populated.
- Monitor schedule (SPY-06): paused on conversion by default, strategist re-enables if wanted.

## Out of Scope

- Migrating prospect data into the live analytics views (SPY-08 swap).
- Billing / Stripe customer creation (separate flow).
- Auto-onboarding email to the new client (handled by existing email composer flow).

## Architecture Wiring

- Reuses existing `invite_tokens` infrastructure.
- Reuses `createAdminClient()` for cross-table writes.
- New FK columns on `clients`: `converted_from_prospect_id` (nullable, unique).
- Existing `getPortalClient()` flow works once invite is accepted.

## Open Questions

1. What's the default tier on convert? (Default: ask the sales rep; populate from a dropdown of existing tiers.)
2. Auto-assign strategist on convert? (Default: yes, sales rep's default assignee per org settings; allow override.)
3. Keep prospect record around forever, or archive on conversion? (Default: archive — set `archived_at`, hide from `/admin/prospects` by default.)

## Assumptions

- Existing invite + organization flows are stable enough to call from this conversion path.
- Data linkage queries are fast (FK + indexes adequate).
- Sales reps will use this flow; without it they create clients manually and break linkage.

## Done When

- 3 real prospect-to-client conversions completed end-to-end.
- "From prospecting" panel renders on the new client record.
- Invite + login flow works for the converted prospect's primary contact.
- Activity log entry verified.
