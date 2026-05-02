# PRD: Credits

## Introduction

Build a credit system that turns Nativz's video deliverable contracts into a measurable, self-serve resource the team and the client can both see in real time. Each client is sold a monthly allowance of **credits**, where 1 credit = 1 paid, edited, short-form video. Credits are consumed only when a client formally **approves** a video on its share-link review page, which is already the canonical "this is finished" signal in the calendar workflow. Clients can buy top-up packs at any time when they need an extra video that month.

Today, the team tracks deliverables by counting Drive folders and Monday cards. There's no shared scoreboard. Account managers don't know whether a client has consumed 3 or 7 of their 8 monthly videos until they go count manually, and clients have no visibility at all. This drives both over-delivery (we ship 10 videos to a client paying for 8) and friction at renewal time (the client thinks they got 5, we think we shipped 8).

Credits make the deliverable count first-class data: an immutable ledger inside Cortex, a balance pill on every client's portal, and a Stripe-backed top-up flow so the client can buy more without an email thread.

**Why this matters:** the hardest revenue conversations Nativz has are about scope. Credits replace "did we ship enough this month" with a number both parties can point at. Over-delivery becomes a deliberate gift, not an accident. Renewals become forecasts, not arguments.

## Architecture Decision: Approval as the Consumption Event

We considered three triggers for consumption:

1. **On scheduling** — credit consumed the moment a post is added to the content drop. Rejected: punishes editors for queuing draft posts that get cut.
2. **On revised-video upload** — credit consumed when the editor pushes a final cut. Rejected: rewards rework with extra credits, charges twice for one deliverable that needed a re-edit.
3. **On client approval** — credit consumed when the client clicks "approve" on the share link. Chosen: approval is the only mutually-agreed completion signal, and it's already a hard event in the existing data model (`scheduled_posts` join + `post_review_comments.status = 'approved'`).

The consumption hook lives in exactly one place: `app/api/calendar/share/[token]/comment/route.ts` inside the `if (finalStatus === 'approved')` branch. A unique idempotency key per scheduled post means re-approvals after revisions never double-charge, and unapprovals refund automatically.

## Goals

- Give every client a visible, real-time credit balance scoped to their organization
- Track every grant, consumption, refund, and adjustment as an immutable ledger entry
- Make approval the single trigger that consumes a credit, with idempotent semantics across approve → unapprove → re-approve
- Run a daily monthly-reset cron with three rollover policies (`none`, `cap`, `unlimited`)
- Let admins manually grant credits (annual prepay, apology credits, contract bumps) with audit trail
- Let clients self-serve top-up purchases via Stripe Checkout
- Surface a low-balance warning email at <= 1 credit and again on overdraft
- Never block a client from approving a video, overdraft is allowed and flagged for revenue follow-up

## Non-Goals (v1)

- Multi-organization shared pools (e.g. agency reseller giving sub-clients access to a parent pool)
- Per-video pricing tiers (e.g. 30s = 1 credit, 60s = 2 credits)
- Credit expiry on top-up packs, top-ups roll forever
- Free trial credit accounting separate from `kind = 'adjust'`
- Refund issuance to the credit card on unapprovals, internal balance only

## User Stories

### US-001: Client sees their credit balance on the portal
**Description:** As a client (viewer role), I want to see how many credits I have left this month so I can plan whether to ask for an extra video or wait for next month's reset.

**Acceptance Criteria:**
- [ ] New `/portal/credits` page accessible from the portal sidebar
- [ ] Hero card shows current balance, monthly allowance, period start and end dates
- [ ] Ring chart visualises consumed vs allowance for the current period
- [ ] Transaction history table: most recent first, columns for date, kind, delta, balance after, video title (when applicable)
- [ ] "Buy more credits" CTA visible when balance <= 2
- [ ] RLS scopes the page to the user's own `organization_id`
- [ ] Typecheck/lint passes

### US-002: Account manager sees client balance from admin
**Description:** As an admin, I want a Credits panel on the client detail page so I can see balance, history, and adjust the allowance without opening the database.

**Acceptance Criteria:**
- [ ] New "Credits" panel on `/admin/clients/[id]`
- [ ] Shows balance, allowance, period dates, rollover policy, and full transaction history
- [ ] Inline editor for monthly allowance (saves to `client_credit_balances.monthly_allowance`)
- [ ] Inline editor for rollover policy + cap
- [ ] "Grant credits" button opens a modal with `amount` (positive integer) and `reason` (free-text) fields
- [ ] Manual grants log a `kind = 'adjust'` transaction with `actor_user_id` set to the admin
- [ ] Manual grants do not require a Stripe payment
- [ ] Typecheck/lint passes

### US-003: Approval consumes a credit
**Description:** As the system, I need to consume exactly one credit when a client approves a video so the balance is always in sync with the deliverable count.

**Acceptance Criteria:**
- [ ] On `finalStatus === 'approved'` in `app/api/calendar/share/[token]/comment/route.ts`, call `consume_credit` RPC with `idempotency_key = 'consume:<scheduled_post_id>'`
- [ ] Re-approval after revision does NOT consume a second credit (idempotency key collides, RPC returns `{ already_consumed: true }`)
- [ ] On approval-comment delete (unapproval), call `refund_credit` with the same key
- [ ] Refund inserts a `kind = 'refund'` transaction with `delta = +1` and a derived idempotency key
- [ ] If `consume_credit` errors, log and continue, approval still succeeds (correctness > billing in the hot path)
- [ ] Re-approve after refund consumes again (clean cycle)
- [ ] Typecheck/lint passes

### US-004: Client buys a top-up pack
**Description:** As a client, I want to buy more credits without emailing my account manager so I can get an extra video shipped this month.

**Acceptance Criteria:**
- [ ] "Buy more credits" CTA on `/portal/credits` opens pack selector (5 / 10 / 25 final SKUs in pricing review)
- [ ] Selecting a pack hits `POST /api/credits/checkout` and redirects to Stripe Checkout
- [ ] Stripe webhook `checkout.session.completed` with metadata `{ kind: 'credits', client_id, pack_size }` triggers `grant_credit` RPC
- [ ] Granted top-up logs a `kind = 'grant_topup'` transaction with `stripe_payment_intent` recorded
- [ ] Top-up confirmation email sent via `sendCreditsTopupConfirmationEmail`
- [ ] Top-up credits roll forever (no expiry)
- [ ] Typecheck/lint passes

### US-005: Monthly reset cron
**Description:** As the system, I need to grant each client their monthly allowance on schedule so balances refresh without manual intervention.

**Acceptance Criteria:**
- [ ] New cron at `/api/cron/credits-reset`, schedule `0 4 * * *`
- [ ] Scans `client_credit_balances` for rows where `next_reset_at <= now()`
- [ ] For each match, calls `monthly_reset_for_client` RPC
- [ ] Rollover policies behave as specified in the spec:
  - `none` (default): new balance = `monthly_allowance`
  - `cap`: new balance = `min(current_balance + monthly_allowance, monthly_allowance + rollover_cap)`
  - `unlimited`: new balance = `current_balance + monthly_allowance`
- [ ] Negative balances at reset still receive the full allowance on top
- [ ] `period_started_at`, `period_ends_at`, `next_reset_at` advance by exactly one calendar month from the prior `period_started_at` (no drift from cron lag)
- [ ] Each reset writes a `grant_monthly` transaction with the actual delta applied
- [ ] Typecheck/lint passes

### US-006: Low-balance warning email
**Description:** As a client, I want an email warning when I'm running low on credits so I can decide whether to top up before I run out.

**Acceptance Criteria:**
- [ ] When `consume_credit` returns `balance_after <= 1`, queue a low-balance email
- [ ] Email goes to the client's primary POC contacts (excluding `paid media only` and `avoid bulk` roles, same filter as revised-videos email)
- [ ] Subject: `${clientName}: 1 credit left this month`
- [ ] Body shows balance, days until reset, "Buy more credits" CTA linking to portal
- [ ] Second email triggered on overdraft (balance goes negative)
- [ ] Dedup: don't send the same low-balance email twice in the same period
- [ ] Typecheck/lint passes

### US-007: Balance pill on the share-link review page
**Description:** As a client reviewing a video on the share link, I want to see how many credits I have left so I'm not surprised when my balance drops after I approve.

**Acceptance Criteria:**
- [ ] Subtle balance pill rendered near the approve buttons on `/c/[token]`
- [ ] Default copy: `8 credits left this month`
- [ ] Goes amber at `0 credits left, contact us to top up`
- [ ] Never blocks approval, no modal, no scary warning
- [ ] Pill is the only credits-flavored UI on the share link, no transaction history, no "buy more" CTA (those live on the portal)
- [ ] Typecheck/lint passes

## Data Model Summary

Two new tables:

- **`client_credit_balances`** — one row per client, holds the live `current_balance`, `monthly_allowance`, period dates, and rollover config
- **`credit_transactions`** — append-only audit log, every grant / consume / refund / adjust / expire event with idempotency keys

Both org-scoped via `clients.organization_id`. RLS gives admins full read/write and viewers SELECT-only on their own org. Full schema in `tasks/credits-spec.md`.

## Pricing Notes

Final pack sizes and prices live in the Stripe dashboard, not in code. The webhook reads `pack_size` from session metadata. Initial proposed packs (subject to revenue review):

| Pack | Credits | Price | Effective per-credit |
|---|---|---|---|
| Starter top-up | 5 | $750 | $150 |
| Growth top-up | 10 | $1,400 | $140 |
| Bulk top-up | 25 | $3,250 | $130 |

These exist for one purpose: let a client buy 1 extra video this week without a contract amendment. The standard monthly contract still drives the bulk of revenue.

## Cutover Plan

1. **Land the data layer.** Migration 220, RPCs, admin Credits panel (read + manual grant only). No consumption hook, no portal surface.
2. **Backfill allowances.** Account managers set `monthly_allowance` per active client to match each contract. Period starts on 1st of next month.
3. **Flip consumption on.** Single line edit in the share-link comment route. Watch the transaction log for a week; reconcile any anomalies via manual `adjust` entries.
4. **Ship portal.** `/portal/credits` page + balance pill on share link + low-balance email.
5. **Ship Stripe.** Top-up packs go live, Stripe webhook routes `kind: 'credits'` to the grant RPC.

Rollback at any step is a `DELETE FROM credit_transactions WHERE created_at > '<launch>'` plus a balance reset. Consumption can also be feature-flagged off via a config check at the top of the RPC.

## Risks + Mitigations

- **Risk:** A bug in the consume hook double-charges or drops charges.
  - **Mitigation:** Idempotency key UNIQUE constraint on `(client_id, idempotency_key)`. Race-replay test in the suite.
- **Risk:** Client gets confused about what consumes a credit (revisions? scheduling?).
  - **Mitigation:** Portal copy explicitly says "1 credit = 1 approved video. Revisions are free." Same line in the low-balance email.
- **Risk:** Account manager forgets to set `monthly_allowance` for a new client and the client overdrafts immediately.
  - **Mitigation:** Onboarding checklist gains a "Set credit allowance" item. Daily admin digest flags clients with `monthly_allowance = 0` and any consumption that month.
- **Risk:** Stripe webhook fires twice for the same checkout session.
  - **Mitigation:** Idempotency key `topup:<stripe_session_id>` on the grant transaction.
- **Risk:** Contract bumps mid-period (client upgrades from 8 to 12 credits halfway through the month).
  - **Mitigation:** Admin edits `monthly_allowance` and adds a manual `adjust` for the prorated delta. Explicit, audited, simple.

## Success Metrics

- 100% of contracted clients have a non-zero `monthly_allowance` within 14 days of launch
- < 1% of approval events fail to consume (logged ledger gap rate)
- Top-up conversion rate >= 25% on low-balance email opens (clicked CTA → completed checkout)
- Account-manager time spent reconciling deliverable counts drops to near-zero (qualitative, monthly check-in)

## Open Questions

See "Open Questions" in `tasks/credits-spec.md`. The leans are documented there; revisit before cutover step 3.
