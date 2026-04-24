# Revenue hardening — design

**Date:** 2026-04-24
**Status:** Approved (self-driven build)
**Implementer:** Claude
**Supersedes nothing; layers safety on top of:** [2026-04-23-revenue-hub-design.md](./2026-04-23-revenue-hub-design.md) + [2026-04-24-proposals-design.md](./2026-04-24-proposals-design.md)

## 1. Why this exists

The Revenue Hub shipped 5,500+ lines across three sessions on `main` with no human QA step. Each review-pass has surfaced bugs the previous pass missed — MRR interval defaulting, `external_id` unique-index absence, kickoff email re-firing on every monthly payment, refund math not subtracting from lifetime totals. The pattern is predictable: the code "works" in the happy path I imagined while writing it, but breaks when simulated against a real agency ledger with 6+ months of client history.

The fix isn't "review harder next time." The fix is a system where:

1. **Known bugs become permanent tests.** Every bug found in a review pass ships with a scenario test that freezes the correct behavior.
2. **Unknown bugs become visible.** A nightly detector runs invariants against live data and surfaces anomalies in the admin UI.
3. **Reviews run automatically.** A dedicated `/revenue-review` slash command runs four fixed lenses on every payment-path change, not just when Jack remembers to ask.
4. **Features are clicked before shipping.** A seed script + staging Stripe account means "feature done" = "I walked the full flow against seeded data."

This document defines the full system and fixes six priority bugs from the session-2 review as the inaugural batch.

## 2. Priority bugs (fix in this session)

### 2.1 Kickoff email re-fires on every monthly payment

**Symptom:** an active client paying a monthly retainer receives the kickoff-scheduling email on every `invoice.paid` webhook — so 12 times a year per client. The `onInvoicePaid` handler calls `queueKickoffEmail` unconditionally after advancing the onboarding phase.

**Fix:** add `clients.kickoff_email_sent_at timestamptz` column. `queueKickoffEmail` short-circuits when that column is populated. Set it inside `queueKickoffEmail` after a successful Resend send.

**Scenario test:** `scenarios.test.ts > 'does not re-queue kickoff email on second invoice.paid for the same client'`. Simulate two `onInvoicePaid` calls back-to-back; assert `sendOnboardingEmail` called exactly once.

### 2.2 Refund math not subtracted from lifetime/MRR/KPIs

**Symptom:** `lifetime_revenue_cents` aggregations use `SUM(stripe_invoices.amount_paid_cents)` without subtracting `stripe_refunds.amount_cents` (or `stripe_charges.amount_refunded_cents`). A $1000 invoice refunded by $500 shows as $1000 lifetime paid. KPIs across `/admin/revenue`, `/admin/clients/[slug]/billing`, `/portal/billing`, and the QuickBooks CSV are all wrong.

**Fix:** introduce `lib/revenue/aggregates.ts` with two shared helpers:

```ts
// Net of refunds, per client or org-wide.
netLifetimeRevenueCents(admin, { clientId?, since? }): Promise<number>
// Net of refunds, per month.
netRevenueByMonth(admin, { clientId?, range }): Promise<Array<{ month, netCents }>>
```

Every call-site that currently does `SUM(amount_paid_cents)` switches to these helpers. QuickBooks CSV keeps raw paid amounts per invoice row (QuickBooks handles refunds as their own line items) but the totals row subtracts refunds.

**Scenario test:** `scenarios.test.ts > 'lifetime revenue subtracts refunds'`. Seed a client with one $1000 paid invoice and one $500 refund; assert `netLifetimeRevenueCents` returns 500.

### 2.3 Proposal signer email unverified

**Symptom:** anyone with the signing URL can type any name and email to sign. The `signer_email` at sign time is whatever the form submits — not necessarily the email the admin sent the proposal to.

**Fix (lightweight for MVP, proper OTP flow deferred):** when `proposal.signer_email` is populated at send time, the public `/api/proposals/public/[slug]/sign` endpoint requires the submitted `signer_email` to case-insensitively match. If they don't match, reject with 400 "Email must match the invited signer." Admins can clear `signer_email` to relax this check (reserved for legacy/migration scenarios).

The proposal sending flow already normalizes `signer_email` into the proposal row; this fix hooks the existing field.

**Follow-up (separate session):** emailed magic link — sign token baked into the URL the signer receives, validated on sign. Present design doesn't address this; this spec only closes the "anyone can type anything" gap.

**Scenario test:** `scenarios.test.ts > 'sign rejects when submitted email does not match invited signer'`.

### 2.4 Proposal Payment Link not invalidated on deposit change

**Symptom:** admin sends a proposal ($5k deposit) → Stripe Payment Link is created for $5k → admin edits to $3k → resends → Resend fires with the stale $5k link. Signer pays wrong amount.

Status-guards already prevent PATCH after send, so the direct risk is narrower than initially feared. But a resend that reads `proposal.stripe_payment_link_url` uses whatever's already stored, even if `deposit_cents` has been changed in a way that bypasses the status guard (e.g., through a manual SQL write, or if guards ever loosen).

**Fix:** on every `/send` call after the first, detect whether `deposit_cents` or `currency` has changed since the existing Payment Link was created. If so:
1. `stripe.paymentLinks.update({ active: false })` on the old link
2. Null out `stripe_payment_link_id` + `stripe_payment_link_url` on the proposal
3. Recreate as if it were a fresh send

Store the deposit amount that the Payment Link was created against in `proposals.payment_link_deposit_cents` (new column) so we can detect drift cheaply.

**Scenario test:** `scenarios.test.ts > 'resending after deposit change invalidates old Payment Link'`.

### 2.5 Proposals never auto-expire

**Symptom:** a proposal past `expires_at` stays as `sent`/`viewed` forever. No cron flips `status='expired'`. Admins have no visibility on upcoming expirations.

**Fix:** extend the daily `/api/cron/revenue-reconcile`:
- `UPDATE proposals SET status='expired', viewed_at = COALESCE(viewed_at, null) WHERE status IN ('sent','viewed') AND expires_at < now()`
- For each newly-expired proposal, log `proposal.expired` lifecycle event.
- Two-day pre-expiry warning: insert `proposal_events(type='expiring_soon')` and one admin notification (type `payment_received` reused as a catch-all — or add `proposal_expiring` to the notifications enum — opting for the latter for explicitness).

**Scenario test:** `scenarios.test.ts > 'daily cron marks past-expiry proposals as expired'`.

### 2.6 Dual-Stripe account decision (not refactor — commitment)

**Symptom:** the current data model assumes a single Stripe account. The `stripe_customers.id text PRIMARY KEY` collides if a second account ever shares a `cus_XXX`. The webhook route verifies a single `STRIPE_WEBHOOK_SECRET`.

**Decision (this spec):** we commit to **single Stripe account (AC) for the foreseeable future**. A future "add Nativz" transition will require a migration adding `stripe_account_id text NOT NULL DEFAULT '<ac_account_id>'` to all `stripe_*` tables, and changing PKs to composite `(stripe_account_id, id)`. The webhook route becomes `/api/webhooks/stripe/[agency]` and looks up a per-agency secret via `getSecret()`.

This document is the record that the refactor is planned; no code change today. A TODO comment is added in `lib/stripe/client.ts` referencing this decision.

**No scenario test — architectural.**

## 3. Runtime anomaly detector (the "unknown bugs" safety net)

### 3.1 Problem

When a bug reaches production, the traces are in data: an orphan invoice with no linked customer, a client stuck in `paid_deposit` for 90 days, a webhook event that never processed, a kickoff email sent twice to the same client. Today these go unnoticed until a client complains. We need proactive detection.

### 3.2 Data model

```sql
create table revenue_anomalies (
  id uuid primary key default gen_random_uuid(),
  detector text not null,                  -- 'kickoff_duplicate', 'orphan_invoice', ...
  severity text not null check (severity in ('info','warning','error')),
  entity_type text,                        -- 'proposal', 'invoice', 'subscription', 'client', ...
  entity_id text,                          -- id of the entity (text to handle both UUID + stripe ids)
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users(id) on delete set null,
  dismissed_reason text,
  unique (detector, entity_type, entity_id)  -- one row per (detector, entity)
);
```

`first_detected_at` freezes on insert. `last_detected_at` updates every run. `resolved_at` is set when a detector no longer reports the finding. `dismissed_at` is set by an admin action when "yes this is fine, stop showing it."

### 3.3 Detectors (seven at launch)

Lives in `lib/revenue/anomalies/detectors/`. Each exports:

```ts
export type Detector = {
  id: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  detect(admin: SupabaseClient): Promise<AnomalyFinding[]>;
};
```

The seven launch detectors:

| Detector | Severity | What it checks |
| --- | --- | --- |
| `kickoff_duplicate` | `error` | `onboarding_email_sends` has >1 `kickoff_invitation` for the same client_id |
| `orphan_stripe_invoice` | `warning` | `stripe_invoices.client_id IS NULL` but the linked customer has a client_id |
| `mrr_drift` | `warning` | `clients.mrr_cents` ≠ recomputed MRR from current subscriptions |
| `expired_proposal` | `info` | `proposals.status IN ('sent','viewed')` past `expires_at` (redundant with the expiry cron but runs as a backstop) |
| `stale_meta_sync` | `warning` | `clients.meta_ad_account_id IS NOT NULL` and `meta_ad_spend_synced_at < now() - 48 hours` |
| `webhook_backlog` | `error` | `stripe_events.processed_at IS NULL` for > 10 minutes after `received_at` |
| `lifecycle_inconsistency` | `warning` | `clients.lifecycle_state='active'` but zero paid invoices ever |

### 3.4 Cron + UI

- `/api/cron/revenue-anomalies` runs all detectors, upserts findings by `(detector, entity_type, entity_id)`. Missing findings this run → set `resolved_at = now()`. New findings → severity-error ones fire an admin notification.
- Schedule: hourly (`15 * * * *`) — fast enough for webhook backlog to matter, not so fast that we hammer the DB.
- `/admin/revenue?tab=anomalies` — new tab, lists open anomalies with dismiss/resolve actions. Count badge on the tab header.

## 4. `/revenue-review` slash command

### 4.1 Purpose

Automate the lensed review we've been doing manually. Lives at `.claude/commands/revenue-review.md`. Invoked by Jack or reflexively after any commit touching payment paths.

### 4.2 Invocation triggers (guidance in the command file)

After a commit or PR that touches any of:
- `lib/stripe/**`
- `lib/proposals/**`
- `lib/lifecycle/**`
- `lib/revenue/**`
- `app/api/webhooks/stripe/**`
- `app/api/revenue/**`
- `app/api/admin/proposals/**`
- `app/api/proposals/**`
- `supabase/migrations/*revenue*` or `*proposal*`

### 4.3 Four fixed lenses

The command instructs the assistant to run each lens sequentially and produce a structured report. See the command file for the full prompt; the lenses are:

1. **Functional correctness** — does it do what the diff claims?
2. **Agency-realistic behavior** — run it mentally against a 6-month-old client with 12 prior invoices.
3. **Money integrity** — refunds, idempotency, currency, proration, double-counting.
4. **Failure modes** — API timeouts, out-of-order webhooks, partial transactions, rate limits.

### 4.4 Output contract

Each finding is classified as:
- **Blocker** — breaks an agency-critical flow; don't ship
- **Medium** — degrades quality; ship with follow-up
- **Polish** — nits; batch with next feature

Every non-polish finding must include a proposed scenario test. The review ends with a "required scenario tests" list the implementer adds to `lib/lifecycle/scenarios.test.ts` or equivalent.

## 5. Seed + staging harness

### 5.1 Purpose

Before any payment-adjacent feature ships, someone walks the full flow in a browser against realistic seeded data. This is the step that catches "Resend key stale" or "the send button is misaligned" or "the kickoff email fires three times."

### 5.2 Seed script

`npm run seed:staging` (new) runs `scripts/seed-staging.ts` which:

1. Upserts three fixture clients (`fixture-a`, `fixture-b`, `fixture-c`) in Supabase with deterministic UUIDs.
2. Populates `contacts` with a primary contact each (emails `qa+fixture-a@nativz.io`, etc. — Gmail-plus-addressable so Jack can receive them without inbox clutter).
3. Seeds one `proposals` row per status state: `draft`, `sent` with a valid Stripe Payment Link (test mode), `signed`, `paid`.
4. Seeds `client_ad_spend` with 3 months of both `manual` and `meta_api` rows.
5. Seeds `client_lifecycle_events` so the Activity tab has content.
6. Does **not** touch live Stripe — uses test-mode keys if `STRIPE_SECRET_KEY` starts with `sk_test_`, otherwise skips Stripe creation with a warning.

Idempotent — re-running reseeds without duplication (uses upsert keyed on `(slug)` for clients + `(id)` for everything else).

### 5.3 Staging docs

`docs/revenue-staging.md` documents:

- How to obtain Stripe test-mode keys and point `STRIPE_SECRET_KEY` at them in `.env.local`
- How to run `stripe listen --forward-to localhost:3001/api/webhooks/stripe` to forward webhook events to local dev
- The seed-data contract: what fixture clients exist, what their state is, what the QA flow looks like
- A manual QA checklist for shipping a revenue feature (covers the bugs we've already found + a growing list)

### 5.4 E2E test (deferred to follow-up)

A Playwright spec at `tests/revenue-e2e.spec.ts` walks create-proposal → send → sign → pay → onboarding-advance. **Not in this session** — scaffolding only: an empty spec file with TODO comments referencing the seed-data fixtures. Full implementation is its own spec.

## 6. Incident playbook

`docs/revenue-incident-playbook.md`: what to do when a production incident is suspected.

Covers:
- Kill-switches for the webhook (block new events by failing signature verification)
- How to stop a runaway email loop (disable Resend API key in dashboard)
- How to reverse a bad payment (Stripe dashboard)
- How to mass-dismiss stale anomalies
- How to disable a specific cron (remove from `vercel.json` + deploy)
- Log locations: Vercel runtime logs, `stripe_events` table, `revenue_anomalies` table, `cron_runs` table
- Who to notify (Jack, Stripe support contact, Resend support)

## 7. Migration plan

Single migration: `160_revenue_hardening.sql`:

1. `alter table clients add column kickoff_email_sent_at timestamptz`
2. `alter table proposals add column payment_link_deposit_cents integer`
3. `create table revenue_anomalies (...)`
4. `alter table notifications add constraint` with `proposal_expiring` type added
5. RLS on `revenue_anomalies`: admin-only all
6. `create index revenue_anomalies_open_idx on revenue_anomalies(severity, last_detected_at desc) where resolved_at is null and dismissed_at is null;`

Applied via Supabase MCP; idempotent throughout.

## 8. File map

New:
- `supabase/migrations/160_revenue_hardening.sql`
- `lib/revenue/aggregates.ts` — net-of-refund math helpers
- `lib/revenue/anomalies/types.ts` — Detector + AnomalyFinding types
- `lib/revenue/anomalies/detectors/index.ts` — registry
- `lib/revenue/anomalies/detectors/kickoff-duplicate.ts`
- `lib/revenue/anomalies/detectors/orphan-stripe-invoice.ts`
- `lib/revenue/anomalies/detectors/mrr-drift.ts`
- `lib/revenue/anomalies/detectors/expired-proposal.ts`
- `lib/revenue/anomalies/detectors/stale-meta-sync.ts`
- `lib/revenue/anomalies/detectors/webhook-backlog.ts`
- `lib/revenue/anomalies/detectors/lifecycle-inconsistency.ts`
- `lib/revenue/anomalies/run.ts` — orchestrator
- `app/api/cron/revenue-anomalies/route.ts`
- `app/api/revenue/anomalies/route.ts` — list + dismiss + resolve endpoints
- `components/admin/revenue/anomalies-tab.tsx`
- `lib/lifecycle/scenarios.test.ts` — scenario tests for all fixed bugs
- `.claude/commands/revenue-review.md` — slash command
- `scripts/seed-staging.ts` + `npm run seed:staging`
- `docs/revenue-staging.md`
- `docs/revenue-incident-playbook.md`
- `tests/revenue-e2e.spec.ts` — deferred stub

Modified:
- `lib/lifecycle/state-machine.ts` — kickoff-once guard
- `lib/proposals/send.ts` — Payment Link invalidation on deposit drift
- `app/api/proposals/public/[slug]/sign/route.ts` — signer email match
- `app/api/cron/revenue-reconcile/route.ts` — proposal expiry + 2-day warning
- `components/admin/revenue/revenue-tabs.tsx` — add anomalies tab
- `app/admin/revenue/page.tsx` — wire anomalies tab
- `app/proposals/[slug]/layout.tsx` — noindex meta
- `public/robots.txt` — disallow `/proposals/`
- every call-site of lifetime/MRR/net-revenue — use new aggregate helpers

## 9. Sequencing

1. Spec + commit (this file)
2. Migration 160 + apply
3. Bug fixes with scenario tests (batched)
4. Anomaly detector library + cron + UI
5. `/revenue-review` slash command
6. Seed script + staging docs + incident playbook
7. Typecheck + lint + vitest + commit + push

## 10. Out of scope (captured for a follow-up)

- Signer-email OTP / magic-link verification
- Dual-Stripe-account refactor
- Multi-currency KPI aggregation
- Playwright E2E test body (scaffolding only today)
- `/revenue-review` automation on every commit (manual invocation today; auto-run on payment-path commits is a hook config)
- Soft-delete for proposals
- `stripe_events` pruning cron
- Notification-archive cron
- Per-client Stripe re-sync button
- Admin audit log for proposal edits (captured in `proposal_events`; richer UI later)
