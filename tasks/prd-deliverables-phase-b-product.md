# PRD: Deliverables Phase B — Product Layer Rewrite

## Why this exists

Phase A evolves the engine to support multi-type deliverables. Phase B replaces the entire **client-facing surface** with one that speaks deliverable language, displays multi-type balances, and aligns behavior with copy. The old `/credits` page, the credit ledger viewer, the balance pill, and all credit emails get retired in this phase.

The directional doc is the source of truth for tone and framing. Every surface this phase touches must pass these tests:

1. A client lands on the page and within 30 seconds knows: how much production capacity they have left, broken out by deliverable type
2. The word "credits" appears nowhere a client can see
3. The page feels like an agency dashboard, not a SaaS billing portal
4. Behavior matches copy (if the pill says "0 left, contact us," approving the next post is actually blocked, no silent overage)

## Goals

- Replace `app/(app)/credits/page.tsx` with `app/(app)/deliverables/page.tsx` (route renamed)
- Rebuild balance display to show one row per deliverable type with monthly allowance + remaining + rollover
- Add a "What's included this month" scope panel sourced from the client's package tier (Phase D adds the tier; Phase B reads it as a stub)
- Rewrite all client-facing emails (low-balance, overdraft, top-up confirm) in deliverable language
- Replace top-up packs (5/10/25) with the canonical add-on SKUs: Extra Edited Video ($150), UGC-Style Video ($200), Rush Delivery upgrade ($149/asset)
- Rewrite the share-link balance pill to show per-type counts and gate approval client-side before the consume RPC fires

## Non-goals

- Pipeline view (in-flight, in-review, delivered) — Phase C
- Editor attribution — Phase C
- Named package tiers as a first-class entity — Phase D (Phase B reads the tier name from a stubbed source)
- Mid-month tier change handler — Phase D

## Route + sidebar changes

- New route: `/deliverables` (brand-scoped, both admin and viewer)
- Old route `/credits` 301-redirects to `/deliverables` (handled in `next.config` or middleware)
- Admin sidebar: rename "Credits" → "Deliverables" in `components/layout/admin-sidebar.tsx`. Title Case per the documented sidebar exception.

## Page layout

```
/deliverables (brand-scoped)
┌─────────────────────────────────────────────┐
│  ProductionHero                             │
│  ────────────                                │
│  Package tier name + description (stubbed)  │
│  3 KPI tiles per deliverable type:          │
│   • Edited Videos: 12 of 20 remaining       │
│   • UGC Videos: 3 of 5 remaining            │
│   • Static Graphics: 47 of 50 remaining     │
│  Resets {date} · Rollover: {policy}          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  ScopePanel — "What's in scope this month"  │
│  ────────                                    │
│  Bullet list per type:                      │
│   • Edited Video — vertical short-form,     │
│     captions, music, 1 round of revisions   │
│   • UGC Video — original creator-style,     │
│     monthly cadence                         │
│   • Static Graphic — Cortex-produced,       │
│     batch delivery                          │
│  Out of scope: long-form, ad creative,      │
│  paid spend (sentence list)                 │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  RecentActivity — replaces ledger viewer    │
│  ────────                                    │
│  Last 30 days of consumption + grants,      │
│  formatted in deliverable language:         │
│   • "Approved: Hot Take #4 — 1 Edited Video"│
│   • "Top-up purchased — 5 Edited Videos"    │
│   • "Monthly reset — full scope refilled"   │
│  No Δ column. No "credits". No raw IDs.     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  AddOnSection                               │
│  ────────                                    │
│  Three cards (Extra Edited Video,           │
│  UGC-Style Video, Rush Delivery)            │
│  with prices and "Buy" CTAs that hit        │
│  Stripe Checkout via existing /api/credits/ │
│  checkout route (extended with type slug).  │
└─────────────────────────────────────────────┘
```

## Component changes

### New components

| File | Purpose |
|---|---|
| `components/deliverables/production-hero.tsx` | KPI tile per type, reads `getDeliverableBalances(clientId)` from Phase A |
| `components/deliverables/scope-panel.tsx` | Reads tier slug → renders type bullets + out-of-scope sentence |
| `components/deliverables/recent-activity.tsx` | Last 30 days of `deliverable_transactions` formatted in human language |
| `components/deliverables/add-on-section.tsx` | Three add-on cards (Extra Edited, UGC, Rush) with Stripe Checkout CTAs |
| `components/deliverables/balance-pill.tsx` | Replaces `components/credits/balance-pill.tsx`. Shows "12 Edited Videos · 3 UGC · 47 Graphics left." Disables approve when relevant balance is 0. |
| `components/deliverables/admin-shell.tsx` | Replaces `components/credits/credits-admin-panel.tsx`. Tabs by deliverable type. Per-type balance editor + ledger. Keeps "Adjust" + "Grant" + "Pause" admin actions. |

### Files retired (deleted in this phase)

- `components/credits/credits-viewer-ledger.tsx`
- `components/credits/credits-admin-panel.tsx`
- `components/credits/balance-pill.tsx`
- `app/(app)/credits/page.tsx`

The directory `components/credits/` is removed entirely. `app/(app)/credits/` is removed and the route redirects.

### Files modified

| File | Change |
|---|---|
| `app/c/[token]/page.tsx` | Replace `<BalancePill>` import with the new `components/deliverables/balance-pill.tsx`. Pass per-type balances. |
| `app/api/calendar/share/[token]/comment/route.ts` | Soft block: before calling `consumeForApproval`, check the client's balance for the relevant deliverable type. If <= 0 AND the client's tier doesn't allow overage, return 402 with a structured error: `{error: 'scope_exhausted', deliverable_type: 'edited_video', remaining: 0, addon_url}`. Today's behavior (silent overage) is the bug. |
| `app/api/credits/checkout/route.ts` | Accept `deliverable_type_slug` and `pack_slug`. Map to Stripe price ID via per-agency env (see env section below). |
| `lib/email/resend.ts` | Replace `sendCreditsTopupConfirmationEmail` with `sendDeliverableAddonReceiptEmail`. Subject: "{N} {label} added to {brand}'s {month} scope." Body in deliverable language. |
| `lib/credits/email.ts` | Rewrite all three senders. Low-scope email subject: "{brand} is approaching this month's video allotment." Overdraft email subject: "Heads-up: {brand} is over scope this month — let's talk." |
| `app/admin/clients/[slug]/credits/page.tsx` | Rename file path to `app/admin/clients/[slug]/deliverables/page.tsx`. Use new admin shell. |

## Stripe price ID env layout

Replace flat 5/10/25 packs with per-type SKUs:

```
NATIVZ_STRIPE_PRICE_ADDON_EDITED_VIDEO
NATIVZ_STRIPE_PRICE_ADDON_UGC_VIDEO
NATIVZ_STRIPE_PRICE_ADDON_RUSH_UPGRADE

ANDERSON_STRIPE_PRICE_ADDON_EDITED_VIDEO
ANDERSON_STRIPE_PRICE_ADDON_UGC_VIDEO
ANDERSON_STRIPE_PRICE_ADDON_RUSH_UPGRADE
```

Old env vars (`NATIVZ_STRIPE_CREDITS_PRICE_5/10/25` etc.) get a deprecation comment in `lib/stripe/client.ts` and stay readable until Phase D, when they're removed.

`lib/credits/topup-packs.ts` becomes `lib/deliverables/addon-skus.ts` with three exported SKU objects:

```ts
export const ADDON_SKUS = {
  edited_video: {
    slug: 'extra_edited_video',
    label: 'Extra Edited Video',
    description: 'One additional edited short-form video, vertical, captions and music included. Ad-hoc beyond your monthly allotment.',
    quantity: 1,
    deliverable_type_slug: 'edited_video',
    price_cents: 15000,
    env_key: 'STRIPE_PRICE_ADDON_EDITED_VIDEO',
  },
  ugc_video: { ... 1 UGC, $200 ... },
  rush_upgrade: { ... 0 deliverables, $149 surcharge — Phase D wires the SLA flag ... },
} as const;
```

The Rush SKU intentionally adds zero deliverables to the balance — it's an SLA modifier on an existing deliverable, not a new unit. Phase B stubs it (the button works and the order completes, but the SLA flag isn't wired until Phase D).

## Copy decisions (canonical wording)

These strings live in a single `lib/deliverables/copy.ts` file so future tone tweaks are one-file changes.

| Surface | Old wording | New wording |
|---|---|---|
| Page title | "{brand} credits" | "{brand} production" |
| KPI tile | "Balance" | "{label_plural} remaining" |
| KPI subtitle | "Allowance" | "{count} per month" |
| Top-up CTA | "Need more credits?" | "Need more this month?" |
| Pack name | "5 credits" | "Extra Edited Video" |
| Pack subtitle | "Tops up your balance" | "Ad-hoc, beyond this month's allotment" |
| Activity row | "+5 Δ" | "5 Edited Videos added (top-up)" |
| Activity row | "-1 Δ" | "1 Edited Video used — Hot Take #4 approved" |
| Reset row | "Monthly reset" | "Monthly scope refilled" |
| Pill (positive) | "8 left" | "12 Edited · 3 UGC · 47 Graphics left" |
| Pill (zero) | "0 left, contact us to top up" | "Out of {label} for {month}. Add one for ${price}" + working CTA |
| Email subject (top-up) | "Top-up complete: +5 credits for {brand}" | "5 Edited Videos added to {brand}'s {month} scope" |
| Email subject (low) | "{brand} is running low on credits" | "{brand} is approaching this month's video allotment" |
| Email subject (overdraft) | "{brand} is in overdraft" | "Heads-up: {brand} is over scope this month, let's talk" |

## Acceptance criteria

- [ ] `/deliverables` page renders for both admin and viewer roles, scoped to the brand
- [ ] All three deliverable types show their balance, allowance, and reset date
- [ ] No instance of the literal word "credit" or "credits" exists in the rendered HTML of `/deliverables`, `/c/[token]`, or any of the three email templates (verified by grep on rendered output during dev)
- [ ] Admin shell preserves all existing admin actions (manual grant, pause, allowance edit, ledger view) but reads/writes per-type
- [ ] Soft block works: approving a video on `/c/[token]` when `edited_video` balance is 0 and overage isn't allowed returns 402 and the UI shows a clear message
- [ ] Stripe Checkout works for all three add-on SKUs across both Nativz and Anderson agencies
- [ ] Confirmation email after add-on purchase says exactly what the user bought in deliverable language
- [ ] All Phase A acceptance criteria still hold (engine works through the new UI)

## Verify gates

1. `npx tsc --noEmit` passes
2. `npm run lint` clean for changed/new files
3. Visual QA via `scripts/magic-link.ts` on `/deliverables` (both admin + viewer) and `/c/[token]` matches existing dark-theme density and looks like a sibling of `/clients/[slug]` not a billing portal
4. End-to-end test: dev client with edited_video balance 0 → click approve on share-link → soft-block fires → click "Add Extra Edited Video" → Stripe Checkout succeeds → email arrives with correct copy → balance refreshes → approve succeeds
5. `grep -ri "credits" components/deliverables/ app/(app)/deliverables/` returns zero matches in user-visible strings (allowed in code identifiers, comments, type names)
6. Commit + push to main
