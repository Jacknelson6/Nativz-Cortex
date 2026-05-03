# Credits — Engineering Spec

> Status: Draft, 2026-05-02. Source of truth for the engineering build of the
> Credits feature. Pair with `tasks/prd-credits.md` for the product framing.
> Open questions are flagged inline as **Q:**.

## TL;DR

Each Nativz client is sold a monthly allowance of **credits**, where 1 credit
= 1 paid, edited, short-form video. A credit is **consumed when the client
formally approves a video** on the share-link review page. Clients can
purchase top-up packs at any time. The system needs:

- A balance + transaction ledger per client
- A consumption hook on the existing approval path
- A monthly reset cron with rollover policy
- A Stripe checkout flow for top-up packs
- Admin and portal UIs to view balance and history

The hard rules:

- Approval is the *only* event that consumes a credit
- A credit is consumed exactly once per video (idempotent on
  approve → unapprove → re-approve)
- An overdraft is allowed but flagged so revenue can chase the renewal
- Every grant, consumption, refund, and adjustment is logged immutably

---

## Data Model

Two new tables, both org-scoped via `clients.organization_id`.

### `client_credit_balances`

One row per client. Cheap to read on every page load.

| column                     | type          | notes                                                                          |
|---------------------------|---------------|--------------------------------------------------------------------------------|
| `id`                       | uuid PK       |                                                                                |
| `client_id`                | uuid FK       | unique                                                                         |
| `monthly_allowance`        | integer       | what the client is sold per period (e.g. 8)                                    |
| `current_balance`          | integer       | live count, can go negative when overdrafted                                   |
| `period_started_at`        | timestamptz   | start of the current allowance window                                          |
| `period_ends_at`           | timestamptz   | when the current window resets                                                 |
| `rollover_policy`          | text enum     | `'none' \| 'cap' \| 'unlimited'` (default `'none'`)                            |
| `rollover_cap`             | integer null  | only used when policy = `'cap'`                                                |
| `next_reset_at`            | timestamptz   | denormalized for cron index                                                    |
| `auto_grant_enabled`       | boolean       | default `true`. Set to false to pause monthly grants without deleting the row. |
| `paused_until`             | timestamptz null | optional time-bounded pause. Cron skips when `now() < paused_until`.        |
| `pause_reason`             | text null     | free-text reason ("client on hold", "contract expired", "trial ended")         |
| `created_at` / `updated_at`| timestamptz   |                                                                                |

`current_balance` is the only field the consumption hook touches at write
time. Everything else is metadata for the cron + UI.

The pause flags carry independent meaning, so we don't conflate "ran out
of contract" with "paused for August":

- `auto_grant_enabled = false`, indefinite pause. Used for churned-but-not
  -deleted clients, free-tier accounts, internal demos. Stays paused
  until an admin re-enables.
- `paused_until = <timestamp>`, time-bounded. Used when a client takes a
  month off. Auto-resumes on the next cron after that timestamp passes.
- Both can be set at once, the cron skips if EITHER says skip.

### `credit_transactions`

Immutable audit trail. Append-only, all balance math is replayable from this.

| column                 | type           | notes                                                                                |
|------------------------|----------------|--------------------------------------------------------------------------------------|
| `id`                    | uuid PK        |                                                                                      |
| `client_id`             | uuid FK        |                                                                                      |
| `kind`                  | text enum      | `'grant_monthly' \| 'grant_topup' \| 'consume' \| 'refund' \| 'adjust' \| 'expire'`  |
| `delta`                 | integer        | signed; consumes are negative                                                        |
| `balance_after`         | integer        | denormalized for fast scanning                                                       |
| `charge_unit_kind`      | text null      | `'drop_video' \| 'scheduled_post'`. Set on consume/refund.                           |
| `charge_unit_id`        | uuid null      | the dv or sp UUID. Together with `charge_unit_kind` forms the dedup key.             |
| `scheduled_post_id`     | uuid null      | set on `consume` and `refund` even when keyed by drop_video — kept for joins/UI.     |
| `refund_for_id`         | uuid null      | on `refund` rows: FK to the `consume` row this refund neutralizes.                   |
| `share_link_id`         | uuid null      | the share-link the approval came through                                             |
| `reviewer_email`        | text null      | who triggered the consume                                                            |
| `stripe_payment_intent` | text null      | set on `grant_topup`                                                                 |
| `actor_user_id`         | uuid null      | admin who did a manual `adjust`                                                      |
| `note`                  | text null      | free-text reason on adjusts                                                          |
| `idempotency_key`       | text null      | informational label, e.g. `consume:dv:<id>:cycle:<n>`. Not the dedup mechanism.      |
| `created_at`            | timestamptz    |                                                                                      |

Idempotency is **state-based**, not key-based: `consume_credit` and
`refund_credit` lock the balance row, then query the live ledger to find
the most recent un-refunded `consume` for the (`charge_unit_kind`,
`charge_unit_id`) pair. Two concurrent fires serialise on the row lock;
the second one sees the first one's row and no-ops.

`refund_for_id` is what makes the un-refunded lookup cheap, on every
refund insert we set it to the consume row's id, so finding "any consume
row not yet referenced by a refund" is one indexed left-join.

### Index plan

- `client_credit_balances` unique on `client_id`
- `client_credit_balances` btree on `next_reset_at` (cron scan)
  - Partial: `WHERE auto_grant_enabled IS TRUE` so paused rows are skipped at the index level.
- `credit_transactions` btree on `(client_id, created_at desc)` for the history UI
- `credit_transactions` btree on `(charge_unit_kind, charge_unit_id, created_at desc)`
  for the un-refunded consume lookup
- `credit_transactions` btree on `refund_for_id` (so the "is this consume already refunded" join is fast)
- `credit_transactions` btree on `scheduled_post_id` (UI/audit lookups)

### RLS

- Admin: full read/write
- Viewer (portal): SELECT-only on rows where the joined `client_id` is in the
  user's `user_client_access`. No writes from the portal — top-ups go through
  the Stripe webhook server-side.

---

## Consumption Hook

The single insertion point: `app/api/calendar/share/[token]/comment/route.ts`,
inside the `if (finalStatus === 'approved')` branch (already exists ~line 181).

### Charge unit, "1 video", not "1 scheduled post"

A video is the editor's deliverable, the file the editor produces. The
calendar fans that one file out:

- Platform fan-out: a single `scheduled_posts` row already serves many
  platforms via `scheduled_post_platforms` (TikTok + Reels + Shorts share
  one post). Approving the post once consumes one credit; the platform
  fan-out is free.
- Schedule fan-out: the SAME source `content_drop_videos` row can be wired
  to *another* `scheduled_posts` (e.g. re-run the clip next month, or post
  the same edit on two different days). We do NOT charge twice for the
  same edit.

The idempotency key encodes that decision:

```
prefer: consume:dv:<content_drop_videos.id>
fall back: consume:sp:<scheduled_posts.id>
```

The fall-back exists because `scheduled_posts` can be created outside the
content-drop flow (the standalone scheduler). When a post is rooted in a
drop video we key by the drop video so re-schedules dedupe; when it's not,
we key by the post itself.

### Lifecycle: state-based, not key-based

The naive design (one immutable idempotency key per post) breaks on
approve → unapprove → re-approve cycles, the second approval can't insert
because the key is already in the table. We use a **state-based** model
instead, anchored in the transaction log itself:

- The `consume_credit` RPC takes a lock on the balance row, then queries
  the ledger: "is there a `consume` row for this charge unit (drop_video
  or scheduled_post) that has NOT been neutralized by a later `refund`?"
  If yes → no-op (return `{ already_consumed: true }`). If no → insert a
  new `consume` row and decrement.
- The `refund_credit` RPC mirrors the same lookup: if there's an
  unrefunded `consume`, insert a `refund` (`delta = +1`) and increment.
  If there's none → no-op.

Both RPCs run inside a single Postgres transaction with `SELECT … FOR
UPDATE` on the balance row, so concurrent fires from a double-click or a
race serialise correctly. The idempotency key on `credit_transactions`
becomes informational (a human-readable label like
`consume:dv:<id>:cycle:<n>`), not the dedup mechanism — the dedup
mechanism is the live ledger query.

This kills three classes of bug at once:

- Double-charge from a double-click (state lookup catches it)
- Lost charge after unapproval-then-reapproval (cycle is a fresh insert)
- Refund leak from rapid toggle (refund only fires against an *unrefunded*
  consume, so unapprove → unapprove can't double-credit)

### Hooking the consume

Inside the existing `if (finalStatus === 'approved')` branch:

```ts
const chargeUnit = await resolveChargeUnit(admin, scheduledPostId);
// returns { kind: 'drop_video', id } | { kind: 'scheduled_post', id }

await admin.rpc('consume_credit', {
  p_client_id: clientId,
  p_charge_unit_kind: chargeUnit.kind,
  p_charge_unit_id: chargeUnit.id,
  p_scheduled_post_id: scheduledPostId,
  p_share_link_id: shareLinkId,
  p_reviewer_email: reviewerEmail,
});
```

`resolveChargeUnit` looks up `content_drop_videos` by `scheduled_post_id`
and returns the drop-video kind if present, else the scheduled-post kind.

The route never fails the approval if the consume errors — it logs and
continues. Approval correctness > billing accuracy in the hot path; ops
reconciles via the transaction log.

### Refund triggers

A consume is refunded when ANY of these happens:

1. **Approval comment is deleted** (existing DELETE handler in the same
   route). Already triggers; we just add the `refund_credit` call.
2. **A `changes_requested` comment lands AFTER an `approved` comment for
   the same post.** This is the silent-overcharge bug from the review.
   The client's effective state is "wants more changes," but the prior
   approval row stays in the audit trail. The consume hook treats this
   as an unapproval and refunds.
3. **The scheduled post is deleted entirely** (admin removes the post
   from the calendar). Cascade: a `BEFORE DELETE` trigger on
   `scheduled_posts` that calls `refund_credit` for any unrefunded
   consume on that post.

The `comment` POST handler grows a sibling branch:

```ts
// existing approval branch keeps the consume_credit call
if (finalStatus === 'approved') { … consume … }

// NEW: any non-approved comment that follows a prior approval refunds
if (finalStatus !== 'approved') {
  const hadPriorApproval = await admin
    .from('post_review_comments')
    .select('id')
    .eq('review_link_id', reviewLinkId)
    .eq('status', 'approved')
    .limit(1);
  if (hadPriorApproval.data?.length) {
    await admin.rpc('refund_credit', {
      p_charge_unit_kind: chargeUnit.kind,
      p_charge_unit_id: chargeUnit.id,
    });
  }
}
```

### Why approval, not delivery

We considered consuming on revised-video upload (i.e. when the editor pushes
a new cut). Rejected because:

- It rewards rework with extra credits — clients pay per *finished* video, not
  per attempt.
- Revisions shouldn't count against the allowance even if they're edited multiple
  times.
- "Approved" is the mutually-agreed completion signal.

---

## Allocation + Reset

A daily cron (`/api/cron/credits-reset`, runs `0 4 * * *`) scans for rows
where `next_reset_at <= now() AND auto_grant_enabled IS TRUE AND
(paused_until IS NULL OR paused_until < now())` and runs the rollover/grant
logic per client. Paused rows are filtered out at the index level via the
partial index on `next_reset_at`, so the cron does no per-row work for
paused accounts.

### Paused / inactive clients

Two pause shapes, both checked above:

- **Indefinite pause** (`auto_grant_enabled = false`): the client stays
  in the table with their last-known balance, but no monthly grants run.
  Used for churned clients we don't want to delete (preserves history),
  free-tier accounts, and internal demos. The portal still shows the
  current balance honestly; the "Buy more" CTA continues to work because
  Stripe top-ups are independent of the auto-grant flag.
- **Time-bounded pause** (`paused_until = <ts>`): used when a client takes
  a month off. The cron skips them until the timestamp passes, then
  resumes on the next nightly run.

When a paused client is unpaused, the cron's *next* run grants one full
allowance and advances `period_started_at` from `now()` (NOT from the
last-known `period_started_at`, which would back-grant skipped months).
Skipped months are explicitly NOT backfilled, an admin who wants to
top-up the missed months does so via a manual `adjust`.

The admin UI surfaces both flags in the Credits panel, with copy that
spells out the difference ("This client is paused indefinitely, no
monthly grants will run" vs "Paused until <date>, resumes on the cron run
after that"). The pause action is one of two buttons:

- "Pause monthly grants" → flips `auto_grant_enabled = false`, prompts
  for `pause_reason`
- "Pause until..." → date picker, sets `paused_until`

### Rollover policies

| policy        | behavior at reset                                                                 |
|---------------|-----------------------------------------------------------------------------------|
| `none` (default) | Drop unused credits. New balance = `monthly_allowance`.                        |
| `cap`         | New balance = `min(current_balance + monthly_allowance, monthly_allowance + rollover_cap)`. |
| `unlimited`   | New balance = `current_balance + monthly_allowance`. Not offered by default; admin-set only. |

Each reset writes a `grant_monthly` transaction with the actual delta applied
(so the audit log shows whether rollover was honored).

The cron also advances `period_started_at`, `period_ends_at`, `next_reset_at`
by exactly one calendar month from the prior `period_started_at` (NOT `now()`,
to prevent drift from cron lag).

### Negative balances at reset

If `current_balance` is negative (overdraft), we still grant the full
allowance on top. So a client at -2 with allowance 8 ends the reset at +6.
The overdraft warning UI is for revenue follow-up, not enforcement.

### First-period proration

A client signs mid-month. We do **not** prorate the first period:

- `period_started_at = now()` at activation, `period_ends_at = now() +
  interval '1 month'`, full `monthly_allowance` granted immediately as a
  `grant_monthly` row.
- The reset cycle anchors to the signup date, not the calendar 1st. A
  client who signs on the 18th resets on the 18th every month forever.

Why no proration:

- Nativz contracts are flat-monthly subscriptions, not metered. A client
  who signs on the 28th still expects "this month's videos."
- Proration creates rounding ambiguity ("you have 1.4 credits") that
  doesn't exist anywhere else in the system.
- Per-client anchoring removes the global thundering-herd problem on a
  shared reset day. The cron sees a smooth distribution of work across
  the month rather than every client at midnight on the 1st.

Edge cases:

- Client signs, then immediately gets paused before the first cron runs
  → the initial grant is independent of the pause flag (it happens at
  activation in the admin UI), and the next reset is what gets skipped.
- Client signs late in the day → the reset anchor is timestamped to the
  minute. UI displays "resets on the 18th of each month" using the
  date-only projection of `period_started_at`.

---

## Contract Source of Truth

`monthly_allowance` lives on `client_credit_balances`, not derived from
any external contract object. The admin updates it whenever the contract
changes. We considered driving it from a Contracts/Subscriptions table
and rejected that for v1:

- Cortex doesn't yet have a single canonical Contracts table that
  represents what every client is sold. There are proposals, there are
  Stripe subscriptions for paid tiers, and there are hand-shake monthly
  retainers tracked in Notion. None of these is the source.
- Special deals (annual prepay = 12-month allowance bump, agency dual-
  brand discount, internal Nativz demo accounts) need an admin-editable
  override anyway, so any auto-sync would still need a manual escape
  hatch.
- The cost of getting it wrong is a misaligned `monthly_allowance` for
  one client, which is visible the first time their balance is wrong.
  Cheap to detect, cheap to fix.

The mitigation for "admin forgets to set it" is the daily admin digest
that flags any client with `monthly_allowance = 0` AND any consumption
in the last 7 days, plus the onboarding checklist line item from the
Risks section.

When Cortex eventually has a canonical Contracts table (separate
project), we'll add a `synced_from_contract_at` timestamp on
`client_credit_balances` and a job that syncs allowance from there,
with the admin-edit override still allowed (last-write wins, with the
override flagged in the UI).

---

## Top-Up Packs (Stripe)

Two surfaces:

1. **Admin** can grant a top-up directly via `POST /api/credits/[clientId]/grant`
   with `{ amount, reason }`. Logs an `adjust` transaction with the actor's
   user ID. No Stripe involved.
2. **Portal** shows a "Buy more credits" button that hits
   `POST /api/credits/checkout`, which mints a Stripe Checkout session for a
   pack (5 / 10 / 25 — final SKUs in PRD).

The Stripe webhook handler already exists at `app/api/stripe/webhook/route.ts`.
Three event types now feed credit state, all gated by metadata
`{ kind: 'credits', ... }` on the originating session:

### `checkout.session.completed`

1. Verifies the session
2. Calls `grant_credit` RPC with `kind = 'grant_topup'`,
   `stripe_payment_intent` recorded, and idempotency key
   `topup:<session_id>` (the only place key-based dedup is used, since
   there's no consume/refund state-machine for grants)
3. Sends a confirmation email via `sendCreditsTopupConfirmationEmail`

### `charge.refunded`

When a top-up charge is refunded (full or partial) in Stripe, we claw
back the corresponding credits:

1. Look up the matching `grant_topup` row by `stripe_payment_intent`
2. Compute the refunded credit count: full refund → all `pack_size`
   credits; partial refund → `floor(refund_amount / unit_price)`
   credits, with the unit_price recorded in the original session
   metadata
3. Insert an `expire` row with `delta = -<refunded_count>`,
   `note = 'stripe_refund:<charge_id>'`, idempotency key
   `expire:refund:<charge_id>`
4. If `current_balance` goes negative as a result (the client already
   spent the credits), we let it. Overdraft is allowed by design and
   the daily admin digest already catches this.

Partial refunds against a top-up that's already partially clawed back
are additive: the `expire` rows track cumulative refunded amount, and
the idempotency key includes the Stripe `refund_id` (not just
`charge_id`) when there are multiple refund events on the same charge.

### `charge.dispute.created`

A chargeback is functionally a forced refund. Same treatment as
`charge.refunded`, but the `note` is
`stripe_dispute:<dispute_id>` and the row is also flagged in the
admin digest with higher urgency (chargebacks need human attention).

When the dispute is later resolved in Stripe (`charge.dispute.closed`),
we do NOT auto-restore the credits. If we win the dispute and the
client should get their credits back, an admin issues a manual
`adjust` with a note pointing at the dispute. This keeps the audit
trail explicit.

### Idempotency on refund/dispute paths

- `expire:refund:<refund_id>` — primary key for each Stripe refund
  event (note: `refund_id`, not `charge_id`, since a charge can have
  multiple partial refunds)
- `expire:dispute:<dispute_id>` — primary key for each dispute event
- Both use the `idempotency_key` column on `credit_transactions` as
  a true UNIQUE constraint (the only place where idempotency keys
  carry that semantic). The state-based dedup on consume/refund is
  separate.

To support that, the migration adds a partial unique index:
`CREATE UNIQUE INDEX ... ON credit_transactions (idempotency_key)
WHERE kind IN ('grant_topup', 'expire')` so accidental double-fires
of Stripe webhooks can't double-grant or double-claw.

**Q:** Do top-up credits expire on inactivity? Lean: no, they roll
forever. The `expire` kind is reserved for Stripe-driven clawbacks,
not time-based decay.

---

## UI Surfaces

### Admin

- `/admin/clients/[id]` → new "Credits" panel: balance, allowance, period dates,
  rollover policy editor, grant-from-thin-air button (for pre-paid annual deals
  or apologies), full transaction history table.
- `/admin/content-tools` projects table → small chip on each project showing
  `Credits: <n> / <m> consumed` so the team has at-a-glance visibility while
  scheduling.

### Portal

- New "Credits" page under the existing portal nav: hero card with
  `current_balance`, ring chart showing consumed vs allowance for the current
  period, "Buy more credits" CTA, transaction history.
- On the calendar review page (`/c/[token]`), inline a **subtle** balance
  pill near the approve buttons: "8 credits left this month."
  No hard block, no scary modal. If it goes negative, the pill turns amber:
  "0 left, contact us to top up." Never block approval.

### Email

- New transactional email: low-balance warning when consumption drops the
  balance to <= 1 (and again on overdraft). Plain `buildUserEmailHtml` style,
  goes to the client's primary POC.

---

## Migration Plan

Migration `220_credits_v1.sql`:

1. Create both tables + all indexes:
   - Partial cron index on `next_reset_at WHERE auto_grant_enabled IS TRUE`
   - `(charge_unit_kind, charge_unit_id, created_at desc)`
   - `refund_for_id`
   - **Partial UNIQUE index on `credit_transactions(idempotency_key)
     WHERE kind IN ('grant_topup', 'expire')`** — backs the
     Stripe webhook dedup; consume/refund rows do NOT participate
     in this constraint (they use state-based dedup via the live
     ledger query).
2. Create the SQL functions: `consume_credit`, `refund_credit`,
   `grant_credit`, `monthly_reset_for_client`. All four take `FOR UPDATE`
   on the balance row before any ledger work.
3. Create the `BEFORE DELETE` trigger on `scheduled_posts` that calls
   `refund_credit` for any unrefunded consume on the post's charge unit
4. Backfill: for every existing client, insert a `client_credit_balances`
   row with `monthly_allowance = 0`, `current_balance = 0`,
   `period_started_at = now()`, `next_reset_at = now() + interval '1 month'`,
   `auto_grant_enabled = true`. Allowance gets edited manually per client
   in the admin UI as part of the rollout. Inactive/churned clients get
   `auto_grant_enabled = false` set during step 2 of the cutover.
5. Enable RLS, add admin + viewer policies

No backfill of historical consumption — credits start counting forward from
launch day.

---

## Cutover Sequence

1. Land migration + RPCs + `BEFORE DELETE` trigger + admin "Credits"
   panel (read, manual grant, pause buttons). No consumption hook yet,
   no portal surface.
2. Per active client, set `monthly_allowance` to contract. Per
   inactive/churned client, flip `auto_grant_enabled = false` with a
   `pause_reason`.
3. Flip the consumption hook on, the three comment-route edits land
   together (consume on approval, refund on changes_requested-after
   -approval, refund on approval-delete). Watch the transaction log for
   a week, especially `refund_for_id` linkage and any orphan rows.
4. Ship the portal Credits page + low-balance email.
5. Ship Stripe top-ups + checkout webhook.

Rollback at any step: `DELETE FROM credit_transactions WHERE created_at >
'<launch>'` + `UPDATE client_credit_balances SET current_balance =
monthly_allowance` resets the world. The consume + refund RPCs can also
be no-op'd by adding a feature-flag table check at the top of each
function.

---

## Resolved Decisions (review pass, 2026-05-02)

- **Charge unit:** 1 credit = 1 *video* (drop_video), not 1 scheduled_post.
  Platform fan-out is free; schedule fan-out (same edit re-scheduled) is
  free. The idempotency keys by `content_drop_videos.id` when present,
  falls back to `scheduled_posts.id` for posts created outside the drop
  flow.
- **Lifecycle:** state-based dedup via `refund_for_id` join, not
  immutable idempotency keys. Approve → unapprove → re-approve cycles
  correctly produce one net consume.
- **Refund triggers:** approval-comment delete, *and* a later
  `changes_requested` comment on the same post, *and* `scheduled_post`
  deletion via cascade trigger. The "approve, then ask for more changes"
  silent-overcharge bug is fixed.
- **Refund cap:** at most one outstanding consume per charge unit at any
  time. Refund only fires against an *unrefunded* consume.
- **Pause/inactive clients:** `auto_grant_enabled` flag + optional
  `paused_until`. Cron filters at the index level. Skipped months are
  not backfilled.
- **First-period proration:** none. New clients get full allowance on
  signup, reset cycle anchored to signup date.
- **Contract source-of-truth:** `monthly_allowance` is admin-edited on
  `client_credit_balances` for v1. No external Contracts table dep.
  Future sync job is documented as a separate project.
- **Stripe refunds + disputes:** webhook handles `charge.refunded` and
  `charge.dispute.created` by inserting `expire` rows with negative
  delta. Dispute resolutions in our favor do NOT auto-restore credits;
  manual `adjust` only. Backed by partial UNIQUE index on
  `idempotency_key` for `kind IN ('grant_topup', 'expire')`.

## Open Questions

- **Q:** Should the portal pill be visible to viewer-role users only, or also
  to share-link reviewers (who may not be the billing contact)? Lean: pill is
  only on the portal Credits page; share-link reviewers see nothing
  credit-flavored.
- **Q:** Do we need a notion of "free trial credits" distinct from
  `grant_monthly`? Lean: no, just use `kind = 'adjust'` with `note = 'trial'`
  for now.
- **Q:** Multi-organization / shared credit pools (e.g. agency reseller)? Out
  of scope for v1.

---

## Files to Create / Edit

**New:**
- `supabase/migrations/220_credits_v1.sql` — both tables, RPCs
  (`consume_credit`, `refund_credit`, `grant_credit`,
  `monthly_reset_for_client`), `BEFORE DELETE` trigger on
  `scheduled_posts` that calls `refund_credit` for any unrefunded consume,
  partial cron index on `next_reset_at WHERE auto_grant_enabled IS TRUE`,
  and the `(charge_unit_kind, charge_unit_id, created_at desc)` +
  `refund_for_id` indexes
- `lib/credits/consume.ts` — typed wrapper over `consume_credit` RPC,
  takes `(client_id, charge_unit_kind, charge_unit_id, scheduled_post_id?,
  share_link_id?, reviewer_email?)`
- `lib/credits/refund.ts` — typed wrapper over `refund_credit`
- `lib/credits/resolve-charge-unit.ts` — looks up `content_drop_videos`
  by `scheduled_post_id`, returns `drop_video` kind if present, else
  `scheduled_post`
- `lib/credits/types.ts`
- `app/api/credits/[clientId]/grant/route.ts` — admin manual grant
- `app/api/credits/[clientId]/pause/route.ts` — admin pause/resume,
  PATCH body `{ mode: 'indefinite' | 'until' | 'resume', paused_until?,
  pause_reason? }`
- `app/api/credits/checkout/route.ts` — portal Stripe checkout
- `app/admin/clients/[id]/credits/` — admin UI panel (balance, history,
  rollover editor, grant button, **Pause monthly grants** + **Pause
  until...** buttons)
- `app/portal/credits/page.tsx` — portal UI
- `components/credits/balance-pill.tsx` — share-page pill
- `lib/email/templates/credits-low-balance.ts`
- `app/api/cron/credits-reset/route.ts` — daily reset cron, scans with
  the paused-aware filter
- `scripts/seed-client-allowances.ts` — one-time setter

**Edit:**
- `app/api/calendar/share/[token]/comment/route.ts`:
  - On approval: resolve charge unit, call `consume_credit`
  - On non-approval comment that follows a prior approved comment: call
    `refund_credit` (silent-overcharge fix)
  - On comment DELETE for an approval row: call `refund_credit`
- `app/api/stripe/webhook/route.ts`:
  - `checkout.session.completed` with `kind: 'credits'` metadata →
    `grant_credit` with key `topup:<session_id>`
  - `charge.refunded` → look up matching grant by
    `stripe_payment_intent`, insert `expire` with key
    `expire:refund:<refund_id>`
  - `charge.dispute.created` → insert `expire` with key
    `expire:dispute:<dispute_id>`
- `vercel.json` — add `/api/cron/credits-reset` at `0 4 * * *`
- `app/admin/clients/[id]/page.tsx` — link the new panel
- Sidebar nav — add Credits to the portal sidebar
- Onboarding flow / new-client activation — require setting
  `monthly_allowance` before activation, no zero-default path

---

## Test Plan

### `consume_credit` (state-based dedup)
- Concurrent double-fire on the same charge unit serialises on the row
  lock; one consume row inserted, the second call returns
  `{ already_consumed: true }`. Reuse the all-approved race-replay harness.
- Charge keyed by `drop_video`: same `content_drop_videos.id` wired to two
  different `scheduled_posts` (re-schedule), approving both consumes ONE
  credit.
- Charge keyed by `scheduled_post`: a post created outside the drop flow
  (no `content_drop_videos.scheduled_post_id` link) consumes correctly
  using the scheduled-post fallback key.
- Platform fan-out: a single `scheduled_posts` with three rows in
  `scheduled_post_platforms` consumes ONE credit on approval.

### `refund_credit`
- Approve → refund → ledger has a `refund` row with `refund_for_id` set
  to the `consume` row's id; balance restored.
- Approve → refund → refund again: second refund returns
  `{ no_consume_to_refund: true }` (refund cap holds).
- Approve → changes_requested (after approval, same post): silent-overcharge
  fix triggers, refund row is written.
- Approve → delete the scheduled_posts row entirely: `BEFORE DELETE`
  trigger fires, refund row written before the post row goes.
- Approve → unapprove → re-approve cycle: ledger has consume + refund +
  consume; balance net-decremented by exactly 1.

### Allocation + Reset cron
- `monthly_reset_for_client` against fixtures for all three rollover
  policies (`none`, `cap`, `unlimited`); math verified per row.
- Negative balance at reset still gets full allowance on top.
- Period dates advance from the prior `period_started_at` (no drift even
  if the cron runs late).
- **Pause filter:** fixture client with `auto_grant_enabled = false` is
  skipped by the cron. Fixture with `paused_until > now()` is skipped.
  Fixture with `paused_until < now()` is granted (auto-resume).
- Resume after pause does NOT backfill skipped months; one allowance, new
  `period_started_at = now()`.

### Stripe + manual grants
- Top-up via test mode webhook: `grant_credit` row written with
  `kind = 'grant_topup'`, `stripe_payment_intent` set, idempotency key
  `topup:<session_id>`.
- Webhook fires twice for the same session: partial UNIQUE index on
  `idempotency_key` deduplicates; one grant only.
- `charge.refunded` (full): `expire` row written with
  `delta = -<pack_size>`, `note = 'stripe_refund:<charge_id>'`,
  idempotency key `expire:refund:<refund_id>`. Balance decremented.
- `charge.refunded` (partial, 2 of 5): `expire` row with `delta = -2`.
  A second partial refund on the same charge inserts a second `expire`
  row keyed by the second `refund_id` (additive).
- `charge.refunded` after credits already consumed: balance goes
  negative; overdraft is allowed; daily admin digest flags it.
- `charge.dispute.created`: `expire` row with `delta = -<pack_size>`,
  `note = 'stripe_dispute:<dispute_id>'`, key
  `expire:dispute:<dispute_id>`.
- `charge.dispute.closed` (won by us): no automatic state change. Admin
  manually issues an `adjust` if restoring is desired.
- Admin manual grant via `/api/credits/[clientId]/grant`: row written
  with `kind = 'adjust'`, `actor_user_id` set, no Stripe metadata.

### First-period proration
- New client activation grants full `monthly_allowance` immediately;
  `period_started_at = now()`. No fractional credits.
- Reset cycle anchors to signup date. Client signed on the 18th resets
  on the 18th every month. Verified across month-boundary edge cases
  (signed Jan 31, resets Feb 28/29 then Mar 28).

### Negative
- Approval continues to work even if `consume_credit` raises (ledger gap
  is a recoverable ops issue, blocking approval is not).
- Comment POST handler's `changes_requested` refund branch tolerates
  `refund_credit` errors silently and still writes the comment row.
