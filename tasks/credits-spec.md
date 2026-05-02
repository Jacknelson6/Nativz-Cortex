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

| column                     | type          | notes                                                          |
|---------------------------|---------------|----------------------------------------------------------------|
| `id`                       | uuid PK       |                                                                |
| `client_id`                | uuid FK       | unique                                                         |
| `monthly_allowance`        | integer       | what the client is sold per period (e.g. 8)                    |
| `current_balance`          | integer       | live count, can go negative when overdrafted                   |
| `period_started_at`        | timestamptz   | start of the current allowance window                          |
| `period_ends_at`           | timestamptz   | when the current window resets                                 |
| `rollover_policy`          | text enum     | `'none' \| 'cap' \| 'unlimited'` (default `'none'`)            |
| `rollover_cap`             | integer null  | only used when policy = `'cap'`                                |
| `next_reset_at`            | timestamptz   | denormalized for cron index                                    |
| `created_at` / `updated_at`| timestamptz   |                                                                |

`current_balance` is the only field the consumption hook touches at write
time. Everything else is metadata for the cron + UI.

### `credit_transactions`

Immutable audit trail. Append-only, all balance math is replayable from this.

| column                 | type           | notes                                                                                |
|------------------------|----------------|--------------------------------------------------------------------------------------|
| `id`                    | uuid PK        |                                                                                      |
| `client_id`             | uuid FK        |                                                                                      |
| `kind`                  | text enum      | `'grant_monthly' \| 'grant_topup' \| 'consume' \| 'refund' \| 'adjust' \| 'expire'`  |
| `delta`                 | integer        | signed; consumes are negative                                                        |
| `balance_after`         | integer        | denormalized for fast scanning                                                       |
| `scheduled_post_id`     | uuid null      | set on `consume` and `refund`                                                        |
| `share_link_id`         | uuid null      | the share-link the approval came through                                             |
| `reviewer_email`        | text null      | who triggered the consume                                                            |
| `stripe_payment_intent` | text null      | set on `grant_topup`                                                                 |
| `actor_user_id`         | uuid null      | admin who did a manual `adjust`                                                      |
| `note`                  | text null      | free-text reason on adjusts                                                          |
| `idempotency_key`       | text unique    | e.g. `consume:<scheduled_post_id>`                                                   |
| `created_at`            | timestamptz    |                                                                                      |

The `idempotency_key` UNIQUE constraint is what makes consumption
idempotent. The approval handler tries to insert; if the key already
exists, it's a re-approval and we no-op.

### Index plan

- `client_credit_balances` unique on `client_id`
- `client_credit_balances` btree on `next_reset_at` (cron scan)
- `credit_transactions` btree on `(client_id, created_at desc)` for the history UI
- `credit_transactions` unique on `idempotency_key`
- `credit_transactions` btree on `scheduled_post_id` (refund lookup)

### RLS

- Admin: full read/write
- Viewer (portal): SELECT-only on rows where the joined `client_id` is in the
  user's `user_client_access`. No writes from the portal — top-ups go through
  the Stripe webhook server-side.

---

## Consumption Hook

The single insertion point: `app/api/calendar/share/[token]/comment/route.ts`,
inside the `if (finalStatus === 'approved')` branch (already exists ~line 181).

Flow:

1. Resolve the `scheduled_post_id` for the approval (already in scope via the
   review-link join).
2. Resolve the `client_id` (already in scope via the share link).
3. Atomically insert into `credit_transactions`:
   ```ts
   const idempotencyKey = `consume:${scheduledPostId}`;
   const { data, error } = await admin.rpc('consume_credit', {
     p_client_id: clientId,
     p_scheduled_post_id: scheduledPostId,
     p_share_link_id: shareLinkId,
     p_reviewer_email: reviewerEmail,
     p_idempotency_key: idempotencyKey,
   });
   ```
4. The `consume_credit` Postgres function:
   - Locks the balance row
   - Inserts the transaction with the idempotency key (catches `unique_violation`,
     returns `{ already_consumed: true }`)
   - Decrements `current_balance`
   - Returns `{ balance_after, already_consumed }`
5. The route doesn't fail the approval if the consume errors — it logs and
   continues. Approval correctness is more important than billing accuracy in
   the hot path; ops can reconcile via the transaction log.

### Refund (unapproval / approval-comment delete)

The DELETE handler in the same route already clears the all-approved dedup
stamp on approval-comment delete. Add a sibling step:

```ts
await admin.rpc('refund_credit', {
  p_idempotency_key: `consume:${scheduledPostId}`,
});
```

`refund_credit` finds the matching `consume` row, inserts a `refund` with
`delta = +1` and a derived idempotency key (`refund:${scheduledPostId}:<ts>`),
and increments balance. If no matching consume exists, no-op.

**Q:** Should we hard-cap refunds to one per consume, so a quick approve →
unapprove → approve → unapprove cycle doesn't leak free credits? Lean yes
(the second unapprove returns `{ no_consume_to_refund: true }` because the
refund already neutralized the original).

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
where `next_reset_at <= now()` and runs the rollover/grant logic per client.

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
Add a case for `checkout.session.completed` with metadata `{ kind: 'credits',
client_id, pack_size }` that:

1. Verifies the session
2. Calls `grant_credit` RPC with `kind = 'grant_topup'` and the
   `stripe_payment_intent` recorded
3. Sends a confirmation email via `sendCreditsTopupConfirmationEmail`

**Q:** Do top-up credits expire? Lean: no, they roll forever. Easier to sell.

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

1. Create both tables + indexes
2. Create the SQL functions: `consume_credit`, `refund_credit`, `grant_credit`,
   `monthly_reset_for_client`
3. Backfill: for every existing client, insert a `client_credit_balances` row
   with `monthly_allowance = 0`, `current_balance = 0`, `period_started_at =
   now()`, `next_reset_at = now() + interval '1 month'`. Allowance gets edited
   manually per client in the admin UI as part of the rollout.
4. Enable RLS, add admin + viewer policies

No backfill of historical consumption — credits start counting forward from
launch day.

---

## Cutover Sequence

1. Land migration + RPC + admin "Credits" panel (read + manual grant). No
   consumption yet, no portal surface.
2. Manually set `monthly_allowance` per active client to match contract.
3. Flip the consumption hook on (single line in
   `app/api/calendar/share/[token]/comment/route.ts`). Watch the
   transaction log for a week.
4. Ship the portal Credits page + low-balance email.
5. Ship Stripe top-ups + checkout webhook.

Rollback at any step: `DELETE FROM credit_transactions WHERE created_at >
'<launch>'` + `UPDATE client_credit_balances SET current_balance =
monthly_allowance` resets the world. The consume RPC can also be no-op'd by
setting a feature flag table check at the top.

---

## Open Questions

- **Q:** Refund cap (above) — lean yes
- **Q:** Top-up expiry — lean no
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
- `supabase/migrations/220_credits_v1.sql`
- `lib/credits/consume.ts` — typed wrapper over the RPC
- `lib/credits/refund.ts`
- `lib/credits/types.ts`
- `app/api/credits/[clientId]/grant/route.ts` — admin manual grant
- `app/api/credits/checkout/route.ts` — portal Stripe checkout
- `app/admin/clients/[id]/credits/` — admin UI panel
- `app/portal/credits/page.tsx` — portal UI
- `components/credits/balance-pill.tsx` — share-page pill
- `lib/email/templates/credits-low-balance.ts`
- `app/api/cron/credits-reset/route.ts` — daily reset cron
- `scripts/seed-client-allowances.ts` — one-time setter

**Edit:**
- `app/api/calendar/share/[token]/comment/route.ts` — call `consume_credit` on
  approval, `refund_credit` on approval-delete
- `app/api/stripe/webhook/route.ts` — add `kind: 'credits'` branch
- `vercel.json` — add the reset cron
- `app/admin/clients/[id]/page.tsx` — link the new panel
- Sidebar nav — add Credits to the portal sidebar

---

## Test Plan

- Unit: `consume_credit` idempotency under concurrent inserts (double-fire
  the same `scheduled_post_id`). Use the same race-replay harness as the
  all-approved dedup test.
- Unit: refund finds the matching consume; second refund returns
  `no_consume_to_refund: true`.
- Integration: end-to-end flow — approve a post on a share link, see the
  balance decrement, history entry written, low-balance email triggered at the
  threshold.
- Integration: Stripe top-up via test mode, webhook lands the grant.
- Cron: run `monthly_reset_for_client` against a fixture client with each
  rollover policy; verify the math.
- Negative: approval continues to work even if `consume_credit` raises
  (ledger gap is a recoverable ops issue, blocking approval is not).
