# Revenue Review

Four-lens review for any change that touches payment, billing, lifecycle, or proposal code. Invoke with `/revenue-review` after — or before — landing a commit that modifies any of these paths:

- `lib/stripe/**`
- `lib/proposals/**`
- `lib/lifecycle/**`
- `lib/revenue/**`
- `app/api/webhooks/stripe/**`
- `app/api/revenue/**`
- `app/api/admin/proposals/**`
- `app/api/proposals/**`
- `app/api/cron/revenue-*.**` / `app/api/cron/meta-ads-sync/**`
- `supabase/migrations/*revenue*.sql` / `*proposal*.sql` / `*anomal*.sql`

## Your job as the reviewer

Read the diff (use `git diff HEAD~1 HEAD --` with the paths above, or `git diff main` on a feature branch). Then run four lenses **in order**, producing findings under each. After the four lenses, emit a **Required scenario tests** section listing the tests that must be added to `lib/lifecycle/scenarios.test.ts` before this change ships.

### Lens 1 — Functional correctness

Does the code do what the diff claims? Check:

- The happy path matches the commit message / spec.
- Edge cases: null `client_id`, zero amount, missing email, unlinked Stripe customer.
- Zod schemas cover all body shapes.
- Status guards on mutating routes.
- Idempotency keys where needed (webhook, upserts).

### Lens 2 — Agency-realistic behavior

This is the lens that catches the most bugs. Imagine running the code against a real agency ledger: 20 active clients, 6–18 months of payment history per client, a mix of churned + active + past-due, some with prior refunds, some paying annually. Ask:

- What happens on the 12th `invoice.paid` for the same client? (Is any one-shot logic guarded?)
- What happens when this fires for a lifecycle state other than the one the dev was thinking about?
- Is there a silent re-send of a one-time notification? (Look for unconditional `notifyAdmins` / `sendOnboardingEmail` calls — they need a dedupe guard.)
- Does this work when the client has existing `client_contracts`, `proposals`, `onboarding_trackers` rows from ContractKit + Cortex?
- If the admin edits something mid-flight, does the signer/customer see a stale version?

### Lens 3 — Money integrity

- Refunds subtracted from every lifetime / MRR / net-revenue calculation? (Use `netLifetimeRevenueCents` / `netRevenueByMonth`.)
- Amounts stored as integer cents (never float)?
- Currency respected? (Most of the app is USD — any code that sums across currencies is a bug.)
- Idempotent against webhook retries?
- Could this double-charge a customer or double-refund? (Re-calling Payment Link creation, re-issuing refund.)
- Proration edge cases? (Subscription upgrade mid-cycle.)

### Lens 4 — Failure modes

- Stripe API slow/down — is there a timeout? A retry? A user-visible error?
- Webhook arrives before the entity exists — do we upsert-insert cleanly or 500?
- Webhook arrives out of order (`invoice.paid` before `invoice.created`) — still correct?
- Resend / Meta / third-party fails — do we log + continue, or silently drop?
- DB transaction partially commits — what state are we in?
- Rate limits hit — 429 with useful error, or hang?

## Output format

Emit the review as markdown, classifying every finding by severity:

```
## /revenue-review — <short summary of the diff>

### Blockers
- **[lens] file.ts:123** — short issue — specific fix — scenario test that should exist

### Medium
- …

### Polish
- …

### Required scenario tests
Each Blocker and Medium finding should list a test name + the file it belongs in + the key assertion.

- `scenarios.test.ts > 'refund on client-only sub drops MRR'` — seed monthly sub, apply refund, assert recomputed MRR = 0.
- …
```

## When no issues are found

If the diff is clean, still produce the output — just with empty sections — so the review pass is visible in the commit trail. Silence is not success.

## Coupling to the hardening spec

This command is the automation tier described in `docs/superpowers/specs/2026-04-24-revenue-hardening-design.md` §4. Keep the four lenses synced with that spec; if the spec changes, edit this file.
