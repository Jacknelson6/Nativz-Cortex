# PRD: Deliverables Phase D — Named Package Tiers + Soft Block + Tier Change Handler

## Why this exists

After Phase B, clients see balances per deliverable type, sourced from per-type integers on `client_deliverable_balances`. After Phase C, everyone sees what's in flight and who edited what. What's still missing is the **package itself**: there's no first-class "this client is on Studio" concept. The page renders a hardcoded tier name string. Tier changes (Essentials → Studio mid-month) are manual edits to allowance fields. Add-ons are decoupled from the tier they extend.

Phase D introduces `package_tiers` as a first-class entity with seeded SKUs (Essentials / Studio / Full Social), wires the Stripe webhook handler to detect tier changes on `customer.subscription.updated`, prorates the allowance delta correctly, and finishes the soft-block UX so the client gets a clean "approve" gate before the consume RPC fires.

This is the phase that turns Cortex into a place that **knows the client's contract**, not just a balance counter.

## Goals

- Seed `package_tiers` with the three Anderson Collaborative SKUs (Essentials, Studio, Full Social) per agency
- Tie each `client_deliverable_balances` row to a `package_tier_id` so the per-type allowance is derived from the tier, not free-form
- Detect tier changes on Stripe `customer.subscription.updated` and prorate the allowance delta into the current period
- Wire the Rush Delivery SLA flag (Phase B stubbed it) onto specific deliverables when the add-on is purchased
- Finish the soft-block UX: client sees a clear pre-approval modal before the consume RPC fires, with one-click upgrade or one-click add-on purchase

## Non-goals

- Custom tier creation by admins (admin can only assign existing seeded tiers in v1)
- Tier upgrade UI for clients (admin-initiated only this phase; client self-serve is Phase E)
- Tier downgrade behavior beyond "next period" (no immediate scope clawback if a client downgrades mid-month)
- Multi-currency tier pricing (USD only this phase, matches existing Stripe setup)

## Schema changes (migration 223_package_tiers.sql)

```sql
CREATE TABLE package_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency text NOT NULL CHECK (agency IN ('nativz', 'anderson')),
  slug text NOT NULL,
  display_name text NOT NULL,
  blurb text NOT NULL,
  price_cents integer NOT NULL,
  monthly_term_minimum_months integer NOT NULL DEFAULT 3,
  stripe_price_id text NOT NULL,
  sort_order integer NOT NULL,
  is_best_value boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  scope_in text NOT NULL,           -- bullet list, newline-separated
  scope_out text NOT NULL,          -- "out of scope" sentence
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency, slug)
);

CREATE TABLE package_tier_allotments (
  package_tier_id uuid NOT NULL REFERENCES package_tiers(id) ON DELETE CASCADE,
  deliverable_type_id uuid NOT NULL REFERENCES deliverable_types(id),
  monthly_count integer NOT NULL,
  rollover_policy text NOT NULL DEFAULT 'none' CHECK (rollover_policy IN ('none','cap','unlimited')),
  rollover_cap integer,
  PRIMARY KEY (package_tier_id, deliverable_type_id)
);

ALTER TABLE client_deliverable_balances
  ADD COLUMN package_tier_id uuid REFERENCES package_tiers(id);

ALTER TABLE deliverable_transactions
  ADD COLUMN rush_delivery boolean NOT NULL DEFAULT false;

-- Anderson seeds (per the docs.andersoncollaborative.com pricing page)
INSERT INTO package_tiers (agency, slug, display_name, blurb, price_cents,
  stripe_price_id, sort_order, is_best_value, scope_in, scope_out) VALUES
  ('anderson', 'essentials', 'Essentials',
   'Editing from client-supplied raw assets',
   150000, '${ANDERSON_STRIPE_PRICE_ESSENTIALS}', 10, false,
   E'Professional editing of your raw footage\nPlatform-optimized (IG, TikTok, Reels, Shorts)\nCaptions and text overlays\nMusic selection and audio polish\nOne round of revisions, monthly drive delivery',
   'Long-form content, ad creative, and paid spend management are out of scope.'),
  ('anderson', 'studio', 'Studio',
   'Editing from client-supplied raw assets + Cortex included',
   250000, '${ANDERSON_STRIPE_PRICE_STUDIO}', 20, true,
   E'Everything in Essentials, plus:\n50 static graphics produced monthly with Cortex\nAI-generated content variants\nSplit-test variants (2-3 per concept)\nCaption copywriting + 30-day content calendar\nCortex social listening included',
   'On-site production, paid social management, and UGC creator outreach are out of scope.'),
  ('anderson', 'full_social', 'Full Social',
   'Full social media management + UGC + Cortex included',
   445000, '${ANDERSON_STRIPE_PRICE_FULL_SOCIAL}', 30, false,
   E'Everything in Studio, plus:\n5 UGC videos per month\n100 static graphics produced monthly with Cortex\nMonthly on-site production day\nFull social media management\n$150/mo boosting budget included\nMonthly reports + bi-weekly strategy calls\nFull Cortex dashboard + weekly reports',
   'Long-form content production and paid spend above $150/mo are billed separately.');

-- Allotments for Anderson tiers
WITH t AS (
  SELECT id, slug FROM package_tiers WHERE agency = 'anderson'
), dt AS (
  SELECT id, slug FROM deliverable_types
)
INSERT INTO package_tier_allotments (package_tier_id, deliverable_type_id, monthly_count, rollover_policy)
SELECT t.id, dt.id, c.count, 'none'
FROM (VALUES
  ('essentials',  'edited_video',   10),
  ('studio',      'edited_video',   20),
  ('studio',      'static_graphic', 50),
  ('full_social', 'edited_video',   20),
  ('full_social', 'ugc_video',       5),
  ('full_social', 'static_graphic',100)
) AS c(tier_slug, type_slug, count)
JOIN t ON t.slug = c.tier_slug
JOIN dt ON dt.slug = c.type_slug;

-- Nativz seeds: same shape with Nativz-specific Stripe price IDs and tier
-- names to be confirmed by Jack. Phase D ships Anderson seeds first; Nativz
-- tier seeds land in a follow-up migration once the Nativz pricing page is
-- canonicalized. Until then, Nativz clients keep free-form allowances and
-- a 'custom' package tier slug.
```

## Tier-change handler (Stripe webhook)

`lib/stripe/webhook-handler.ts` already handles `customer.subscription.updated`. Extend it:

```
1. Look up the subscription's price_id; resolve to a package_tier row.
2. If the subscription's previous_attributes shows a price_id change (i.e. tier change), call:
     applyTierChange(client_id, new_tier_id, effective_at)
3. applyTierChange():
   a. Look up old + new tier allotments per deliverable type
   b. Compute the per-day proration:
        days_remaining_in_period = days(period_ended_at - now())
        days_in_period           = days(period_ended_at - period_started_at)
        delta = (new_count - old_count) * (days_remaining_in_period / days_in_period)
        # rounded HALF_UP per type
   c. Insert a `grant_manual` (positive delta) or `expire` (negative) row per type
   d. Update client_deliverable_balances.package_tier_id and the per-type
      monthly_allowance to the NEW counts (effective next reset onward)
   e. Email both admin and the client with a one-line summary:
        "Studio → Full Social effective today.
         +12 Edited Videos, +5 UGC Videos, +50 Static Graphics added pro-rata
         for the rest of this period."
```

This handler is the only legit way to change `package_tier_id` outside of admin manual override.

## Soft-block pre-approval modal

`app/c/[token]/page.tsx` currently shows a balance pill near the approve button. The pill changes copy when balance is 0, but clicking approve still fires the consume RPC and silently overdrafts. Phase D fixes this:

1. Approve button reads the relevant deliverable type's balance client-side (already loaded for the pill)
2. If balance > 0: button works normally
3. If balance = 0 AND tier doesn't allow overage: button is `aria-disabled`, click opens a modal
4. Modal contents:
   - Title: "Out of {type_label} for {month}"
   - Body: "Approving this would put {brand} over scope. Two options:"
   - Option A: "Add an Extra {type_label} for ${price}" → Stripe Checkout for the matching add-on SKU → on success, refresh balance, re-enable approve
   - Option B: "Keep this in draft, talk to {account_manager_name}" → cancel modal, no approval
5. Optional admin override flag on the client: `client.allow_silent_overage = true` lets the modal be skipped (admin can flip on a per-client basis for clients with whom over-delivery is the deliberate norm). Default: false.

## Component changes

### New components

| File | Purpose |
|---|---|
| `components/deliverables/tier-card.tsx` | Renders a `package_tiers` row: name, blurb, price, monthly counts, scope-in bullets, scope-out sentence. Used on `/deliverables` and admin tier picker. |
| `components/deliverables/tier-picker-admin.tsx` | Admin-only modal in admin shell: lists all tiers for the agency, lets admin assign one to the client. Wired to the same `applyTierChange` helper as the webhook (idempotent). |
| `components/deliverables/pre-approval-modal.tsx` | The soft-block modal described above. |

### Files modified

| File | Change |
|---|---|
| `lib/stripe/webhook-handler.ts` | Add `applyTierChange` branch on `customer.subscription.updated` |
| `lib/deliverables/apply-tier-change.ts` | New helper, idempotent, callable from webhook + admin override |
| `lib/deliverables/addon-skus.ts` | Wire Rush SKU: on purchase, mark a specific deliverable's `deliverable_transactions.rush_delivery = true` (purchase flow includes a deliverable_id reference) |
| `app/(app)/deliverables/page.tsx` | Replace stubbed tier name with real `<TierCard>` reading from `client_deliverable_balances.package_tier_id` |
| `app/c/[token]/page.tsx` | Wrap approve button in soft-block check; render `<PreApprovalModal>` when triggered |
| `components/deliverables/admin-shell.tsx` | Add Tier section with `<TierPickerAdmin>` |
| `components/deliverables/scope-panel.tsx` | Read `scope_in` + `scope_out` from the active tier instead of hardcoded copy |

### Env additions

```
ANDERSON_STRIPE_PRICE_ESSENTIALS
ANDERSON_STRIPE_PRICE_STUDIO
ANDERSON_STRIPE_PRICE_FULL_SOCIAL
```

(Nativz tier price IDs follow when Jack confirms the Nativz tier shape.)

## Acceptance criteria

- [ ] Migration 223 applies cleanly. Anderson seeds produce 3 tiers + 6 allotments.
- [ ] Assigning a tier from the admin tier picker updates `package_tier_id` and re-derives all per-type allowances correctly
- [ ] Stripe webhook test: simulate a Studio → Full Social subscription update event, verify the proration math produces the expected `grant_manual` rows for all three deliverable types and updates the tier ID
- [ ] Soft-block modal blocks approval cleanly when balance is 0; one-click add-on purchase unblocks within ~10s
- [ ] Setting `client.allow_silent_overage = true` skips the modal
- [ ] `<TierCard>` renders on `/deliverables` showing the right name + blurb + scope copy for the assigned tier
- [ ] Rush Delivery purchase stamps `rush_delivery = true` on the right deliverable transaction row
- [ ] All Phase A + B + C acceptance criteria still hold

## Verify gates

1. `npx tsc --noEmit` passes
2. `npm run lint` clean
3. End-to-end: dev client on Essentials → admin assigns Full Social → page reflects new tier name + new monthly counts + correct prorated balance
4. Stripe webhook replay test against a saved subscription-updated payload confirms tier-change branch fires
5. Visual QA: tier card on `/deliverables` matches the visual weight of the Anderson pricing page (same tier-name typography weight, same blurb size, scope bullets formatted as a list not a paragraph)
6. Commit + push to main
