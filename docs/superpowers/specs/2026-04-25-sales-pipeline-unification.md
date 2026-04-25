# Sales Pipeline Unification — Proposals × Onboarding

Status: **draft** — written 2026-04-25
Owner: Jack
Estimated build: 12–18h after the chat-driven proposal builder lands.

## Problem

Today, proposals and onboarding live in two separate admin surfaces with
separate mental models:

- **`/admin/proposals`** — flat list of proposals; status pills exist on
  individual rows but no roll-up filter; no client linkage required;
  signing a proposal does not automatically progress an onboarding flow.
- **`/admin/onboarding`** — flow roster scoped per-client; the always-first
  Agreement & Payment segment auto-ticks from proposal events but only
  when a flow is created first and the proposal is generated *from* the
  flow builder (`?flowId=…`).

A proposal generated outside that flow (e.g. straight from
`/admin/proposals/new` with no `flowId`) goes paid → no onboarding flow
exists → the agreement segment never auto-ticks → the kickoff email
never fires. The two systems are correct in isolation but the seam is
brittle.

The user-facing ask is simpler than the implementation:

> Combine proposals and the onboarding page. I want to see all proposals
> we've sent, signed proposals, awaiting-payment proposals, signed-but-
> awaiting-payment proposals — every status at any given moment. And as
> soon as a proposal is signed, it's always linked to a prospect, so we
> jump right into onboarding right after. Onboarding can have the
> agreement attached so its status correlates with onboarding.

## Outcome

One unified surface — **`/admin/sales`** — that shows the full lifecycle of
every prospect/client in one place, with proposals and onboarding as
collapsible sub-states of a single row. Click a row → drill into either
the proposal editor *or* the onboarding flow without leaving the surface.

The data model already supports this; what's missing is:

1. A proposal-by-default lifecycle stage so signing always implies a
   prospect-or-client target,
2. Bidirectional auto-creation between proposals and flows so the seam
   disappears, and
3. A unified roster UI with status-pill filters across the combined
   space.

## Surface

```
/admin/sales
├─ Filters:  [All] [Drafted] [Sent] [Viewed] [Signed]
│            [Awaiting payment] [Paid] [Onboarding] [Active] [Archived]
├─ Tabs:     [Pipeline]  [Proposals]  [Onboarding]
│            └─ "Pipeline" is the default and is the unified roster.
│            └─ The other two tabs are filtered slices for power users
│              who want to drill into one or the other.
└─ Table rows: one per pipeline entry (a prospect or active client).
   Each row collapses both surfaces:
     ┌────────────────────────────────────────────────────────────┐
     │ [logo] Brand name                                           │
     │   ▸ Proposal   Sent · awaiting signature · 5 days old       │
     │   ▸ Onboarding (not started — flow auto-creates on sign)    │
     │ [Open proposal] [Open onboarding] [Resend] [Archive]        │
     └────────────────────────────────────────────────────────────┘
   When a proposal is signed, the row instantly shows:
     ▸ Proposal   Signed 2h ago · awaiting payment
     ▸ Onboarding Awaiting payment · 2 segments queued
   When paid:
     ▸ Proposal   Paid · executed PDF stored
     ▸ Onboarding Active · POC invite sent · 3/14 tasks
```

`/admin/proposals` and `/admin/onboarding` redirect to `/admin/sales`
with a query param prefilling the right tab so old bookmarks still work.

## Data model changes

Most of the wiring is already present (proposals.client_id,
proposals.onboarding_flow_id, onboarding_flows.proposal_id). The gaps:

### 1. `proposals.client_id` becomes effectively-required

Today `proposals.client_id` is nullable so a proposal can be generated
before a `clients` row exists (signer is just a prospect with an email).
That's the gap that breaks "always linked to a prospect."

Two cases to handle:

- **Existing client** — the admin selects a client in
  `/admin/proposals/new` or via the chat builder's `tag_client(slug)`
  tool. `proposals.client_id` is populated. ✅ Already works.
- **Brand-new prospect** — the admin generates a proposal from a name
  + email with no client picked. Today this leaves `client_id = NULL`.
  **New behaviour: auto-create a `clients` row** with
  `lifecycle_state = 'lead'`, name derived from the proposal's
  `signer_legal_entity` (or `signer_name`) and a generated slug. Set
  `proposals.client_id` to that new row. The row is intentionally thin
  (no agency, no contacts beyond the signer) and gets fleshed out as
  the relationship deepens.

This guarantees every signed proposal points at a real `clients` row,
so the post-sign onboarding-flow auto-creation always has a target.

### 2. `onboarding_flows` auto-creates on `proposal.signed` (not just `paid`)

Today the flow exists either before the proposal (built via the flow
builder) or never (proposal sent outside the flow surface).

**New behaviour:** the public sign endpoint (`/api/proposals/public/
[slug]/sign`) — after marking the proposal `'signed'` and writing the
PDF — looks for an existing live `onboarding_flows` row for the
`proposal.client_id`:

- If one exists, link them (`flow.proposal_id = proposal.id`,
  `flow.status = 'awaiting_payment'`).
- If none exists, create one with `status = 'awaiting_payment'`,
  `proposal_id = proposal.id`, scaffold the always-first
  `agreement_payment` segment in `done` for the *signed* sub-step, and
  leave `paid` for the webhook to flip on Stripe success.

Everything downstream (POC invite on paid, milestone fan-out, segment
tracking) already works once the flow exists.

### 3. `proposal_events` already lives — surface it

`proposal_events` rows exist for every status transition (sent /
viewed / signed / paid / counter-signed). The unified roster reads
the latest event per proposal to render the "x days ago" timestamps.
No new tables needed; just a view/RPC for performance.

### Optional: `client_lifecycle_events` joins both worlds

The existing `client_lifecycle_events` table (revenue hub commits)
already logs `proposal.{sent,signed,paid}` and the onboarding flow's
own state transitions can mirror into it. The unified roster is a
feed view on top of `client_lifecycle_events` if we ever want one.

## Status taxonomy (the filter pill bar)

For the pipeline view, every row resolves to one *primary* status, in
this priority order (latest non-terminal stage wins):

1. **Drafted** — proposal exists in `draft` status, never sent.
2. **Sent** — proposal sent, signer hasn't opened it yet (`viewed_at
   IS NULL`).
3. **Viewed** — signer opened the link but hasn't signed.
4. **Signed** — proposal signed; flow exists in `awaiting_payment`;
   Stripe checkout pending.
5. **Awaiting payment** — alias for Signed when we want to call it out
   (it's the same underlying state; UI shows whichever label the user
   filtered on).
6. **Paid** — Stripe webhook fired, flow flipped to `active`. POC
   invite sent.
7. **Onboarding** — flow is `active` AND has at least one in-progress
   segment.
8. **Active client** — flow is `completed`. Client is in retainer mode.
9. **Archived** — proposal canceled or flow archived.

The same priority order drives the *one* status pill on each row. Power
users can drill into the Proposals or Onboarding tab to see the
underlying split status.

## Auto-creation rules (the seam-killer)

```
EVENT                              TODAY                                  AFTER
─────────────────────────────────  ────────────────────────────────────  ─────────────────────────────────
admin generates proposal           creates proposals row, no client       same + auto-create clients row if
  (no client picked)                                                       no match. lifecycle_state='lead'.

admin generates proposal           same + onboarding_flows row already    same as today. Continue with
  via /admin/onboarding/[id]        linked via flowId roundtrip.           existing flowId roundtrip.

signer signs (no flow exists)      proposal.status='signed',              proposal.status='signed' +
                                    no flow created.                       auto-create flow in awaiting_payment
                                                                           status linked to proposal.

signer pays via Stripe             proposal.status='paid' +               same + flow auto-creates if it
                                    flow advance only if flow exists.     somehow still doesn't (defensive).
```

Concretely:

```ts
// app/api/proposals/public/[slug]/sign/route.ts
//   AFTER the existing UPDATE proposals SET status='signed'…

if (proposal.client_id) {
  await ensureFlowForClient(admin, proposal.client_id, {
    proposalId: proposal.id,
    desiredStatus: 'awaiting_payment',
    createdBy: null,  // signer-side — no admin user to credit
  });
}
```

`ensureFlowForClient` is a thin wrapper around the existing
`createFlowForClient` that idempotently links an existing flow's
`proposal_id` if a flow already exists, and creates one otherwise.

## UI implementation

### Server page `/admin/sales/page.tsx`

```ts
const { data: rows } = await admin.rpc('sales_pipeline_rows', {
  agency: filterAgency,         // optional filter
  status: filterStatus,         // optional filter
  search: filterQuery,          // brand name fuzzy
});
```

The RPC `sales_pipeline_rows` returns one row per `clients.id` with the
joined latest proposal + flow + their statuses + cached counts. SQL view
is fine for V1; promote to a materialized view if performance bites.

### Client component: `<SalesPipelineRoster/>`

Mirrors the existing `<OnboardingFlowsRoster/>` shape — table layout,
status-pill column, click-to-open. Adds:

- **Status filter row** — chip-style multi-select; `All` is the default.
- **Quick actions** — "Resend proposal", "Open flow", "Archive". Each
  is a thin client-side dispatcher into the existing API.
- **Pipeline counts** — header strip showing "3 awaiting signature ·
  1 awaiting payment · 5 onboarding · 12 active".

### Redirect old surfaces

- `/admin/proposals` → `/admin/sales?tab=proposals` (302)
- `/admin/proposals/new` stays as-is (deep-linked from the flow builder)
- `/admin/onboarding` → `/admin/sales?tab=onboarding` (302)
- `/admin/onboarding/[id]` stays as-is (flow detail page)

## Build order

1. **`auto_create_client_for_proposal`** — extend
   `lib/proposals/create.ts` to spawn a thin clients row when
   `clientId` is null. Stamp `lifecycle_state='lead'`. (~30 min)
2. **`ensureFlowForClient`** — add to `lib/onboarding/flows.ts`.
   Thin idempotent wrapper. (~20 min)
3. **Sign-time flow auto-creation** — call `ensureFlowForClient` from
   the public sign endpoint when `proposal.client_id` is set. (~20 min)
4. **`sales_pipeline_rows` RPC** — Postgres function joining
   proposals + flows per client_id with latest-event timestamps + a
   computed primary status string. (~1.5h)
5. **`/admin/sales/page.tsx` + `<SalesPipelineRoster/>`** — UI. (~3h)
6. **Redirects** — `next.config.ts` redirects + `/admin/sales` →
   default tab. (~15 min)
7. **Sidebar entry** — replace separate Proposals + Onboarding sidebar
   items with a single "Sales" entry; deep links retained. (~10 min)
8. **E2E smoke** — Playwright walk-through: prospect → proposal sent
   → signed → flow auto-created → paid → onboarding active. (~1h)

Total: ~7–8h once the chat-driven proposal builder is in place. The
chat builder writes through `proposals.client_id` already, so it
benefits from the auto-create-flow path on signing without any
additional wiring.

## Out of scope

- Lifecycle states beyond `lead → contracted → paid_deposit → active →
  churned` — keep using what's there.
- Any client portal exposure of pipeline rows — admin-only surface.
- Cross-agency rollups — each agency's pipeline is independent
  (filtered by `clients.agency`).

## Open questions

1. **Auto-archive cadence** — when a proposal is `expired` and there's
   no flow, should the row drop out of the default "All" filter, or
   stay visible with a muted pill? Default: stay visible, muted.
2. **Multiple proposals per client** — a brand can have a v1 proposal
   that expired and a v2 that's signed. The pipeline row reflects the
   *latest non-archived* proposal; the older ones are visible by
   clicking through to the proposals tab.
3. **Re-onboarding** — once a flow is `completed` and the brand
   churns, do we open a new flow automatically on a new proposal, or
   require explicit "Start new onboarding"? Default: explicit, since
   flows can carry stakeholder lists the admin may want to revisit.

## Migration

- No destructive migrations. New `clients` rows from the auto-create
  path are flagged with `auto_created_from_proposal_id` so we can
  identify them later if we want to backfill agency / contacts.
- Existing proposals with `client_id IS NULL` get a one-shot backfill
  job: for each, generate the auto-created clients row and link
  retroactively. Idempotent — re-running is a no-op.

## Naming + sidebar

Sidebar today:
- Revenue
- Proposals
- Onboarding
- Notifications

Sidebar after:
- Revenue
- **Sales** *(replaces Proposals + Onboarding)*
- Notifications

The `/admin/sales` page header reads:

> **Sales pipeline**
> Every prospect's proposal + onboarding state in one place.
