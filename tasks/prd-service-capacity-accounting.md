# PRD: Service Capacity → Accounting Auto-Population

> **Status: Shipped 2026-05-04.** Phases 1-8 complete. Migrations 233-236 applied to prod. US-001 unit tests in `lib/clients/get-service-capacity.test.ts` (4 passing). Out-of-scope review pill mounts in all three documented spots (client header, deliverable progress strip, period-detail editing banner). No client-visible "credits" leaks remain. Auto-populate engine routes NULL `editor_user_id` consumes to a seeded "Unattributed" team_member (`00000000-0000-0000-0000-0000000000ba`) so they surface in the editing tab for admin re-attribution.

> **The last connective tissue PRD.** This wires the existing pieces together: per-client services (`clients.services`) + package tier (`proposal_templates.tiers_preview`) → monthly deliverable capacity → editor visibility ("X needed this month") → accounting auto-population from approved deliverables → out-of-scope flagging.
>
> Pairs with `prd-deliverables-phase-d-tiers.md` (named tiers exist) and `prd-accounting-revamp.md` (period-detail UX shipped). This PRD does NOT redo either; it connects them.

## 1. Introduction / Overview

Cortex already has:
- A `clients.services` array (e.g. `['Editing', 'SMM']`)
- An accounting period model (`payroll_entries`) with SMM auto-fill at $610/half-period
- Named package tiers + tier-aware onboarding blueprints
- An immutable deliverable ledger (`deliverable_transactions` / `credit_transactions`)
- An approval gate (comments are the only legit publish trigger)

What it does **not** have, and this PRD fixes:
1. A single source of truth for "how many deliverables does this client get this month, per service"
2. Editor-facing visibility on the upload surface ("Nike has 8 / 10 edits delivered this period")
3. Automatic accounting reconciliation from approved deliverables (today: editing entries are typed in by hand)
4. A surface that flags when a client goes over scope before an admin commits payroll

Plus one cleanup: remove `Revenue` from the admin sidebar (Jack: "not super relevant for what we're doing right now").

The product framing rule from `project_credits_directional_pivot.md` still holds: internal admin surfaces can keep `credit*` / `deliverable_transactions` naming; anything a client reads must speak deliverables / production capacity / monthly output.

## 2. Goals

- One source of truth: every client's monthly deliverable count per enabled service is derived from `(services, tier)` and visible on the client settings page.
- Editor upload page (the MUX-final surface) shows "this client has X of Y delivered this period" so editors know the target without asking.
- Accounting period auto-populates an editing row per client when an approved deliverable is reconciled, with the same $-rate logic SMM already uses.
- Out-of-scope deliveries (11th video against a 10-video plan) are visible as a flag in both the editor view and the period detail; never silent, never auto-charge.
- Remove `Revenue` from `components/layout/admin-sidebar.tsx`.

## 3. Non-Goals (Out of Scope)

- Stripe integration to auto-bill overages (manual team handling for v1; can be wired later)
- Building a new tier picker UI on the client settings page (tiers picker already exists in onboarding flow)
- Auto-pulling the package from the live Stripe subscription (we read the snapshot already stored on `clients` / `proposals.tier_key`)
- Blogging deliverable enforcement beyond capacity visibility (no blogging-specific auto-accounting row in v1; SMM and editing are the two with concrete payout shapes)
- Changing the payout rates themselves (SMM stays $610/half-period; editing stays per-row, manual rate entry)
- A new sidebar entry to replace Revenue (no replacement; just remove)
- Refactoring `payroll_entries` schema
- Touching the public `/c/[token]` share-link surfaces

## 4. User Stories

### US-001: Add `service_capacity` derived field to client object

**Description:** As an admin viewing a client, I want to know at-a-glance how many deliverables they get this month, per service, so I don't have to look at the proposal to remember.

**Acceptance Criteria:**
- [ ] New helper `lib/clients/get-service-capacity.ts` exports `getServiceCapacity(clientId)` returning `{ editing: { monthly: 10, period_start, period_end }, smm: { monthly: 60 }, blogging: { monthly: 4 } }` (any service the client doesn't have enabled is omitted).
- [ ] Capacity is read from the most recent `proposals.tier_key` joined to `proposal_templates.tiers_preview[*].deliverables` (jsonb shape: `{ editing: 10, smm: 60, blogging: 4 }`).
- [ ] If a client has a service enabled but no signed proposal (rare, manually-onboarded), capacity falls back to a per-service default in `lib/clients/service-defaults.ts` (`editing: 0`, `smm: 60`, `blogging: 0`) and the helper returns a `source: 'default' | 'proposal'` field.
- [ ] Helper is unit-tested for the three resolution paths: proposal hit, fallback, service-not-enabled.
- [ ] Typecheck + lint pass.

### US-002: Surface monthly capacity on client settings page

**Description:** As an admin, I want a "This month's scope" panel on the client settings page so I can see capacity without leaving the page.

**Acceptance Criteria:**
- [ ] New `<ServiceCapacityPanel client={client} />` mounted at `/admin/clients/[slug]/settings` between the Access & services card and the Workspace modules card.
- [ ] Panel renders one row per enabled service: service name, monthly target (e.g. "10 edited videos"), period dates, and a small badge `from proposal` or `from default`.
- [ ] If the resolved capacity is 0, render an inline "Configure capacity in the signed proposal" hint with a link to the proposal record.
- [ ] Visual density matches `IconCard` from the section card design system (h-9 w-9 accent swatch, 13px ? tooltip).
- [ ] Verify in browser using dev-browser skill.
- [ ] Typecheck + lint pass.

### US-003: Editor upload page shows "X of Y delivered this period"

**Description:** As an editor uploading the final MUX video, I want to see how many deliverables this client has this period and how many are approved already so I know whether I'm in scope.

**Acceptance Criteria:**
- [ ] On the editor's upload surface (the MUX-final upload page; identify exact route during implementation), render a `<DeliverableProgress clientId={clientId} service="editing" />` strip above the upload form.
- [ ] Strip shows: `{approved} / {capacity} delivered this period`, a subtle progress bar, and the period's start/end.
- [ ] When `approved >= capacity`, the strip turns warning-styled and reads `{approved} / {capacity} delivered, {approved - capacity} over scope`.
- [ ] When `capacity === 0` (no proposal / service not enabled), the strip is hidden entirely (don't shame the empty state).
- [ ] Component reads from `GET /api/clients/[clientId]/capacity?service=editing` (new route; see FR-3).
- [ ] Verify in browser using dev-browser skill.
- [ ] Typecheck + lint pass.

### US-004: Auto-populate accounting period with approved editing rows

**Description:** As a super-admin running payroll, I want the accounting period to already have a row per approved editing deliverable so I'm not transcribing from MUX share links.

**Acceptance Criteria:**
- [ ] New `lib/accounting/auto-populate-editing.ts` exports `autoPopulateEditingForPeriod(periodId)` which:
  - Reads all `deliverable_transactions` of `kind = 'consume'`, `charge_unit_kind = 'drop_video'`, `created_at` within the period
  - Groups by `(client_id, editor_user_id ?? team_member_id)`
  - For each group, upserts a `payroll_entries` row with `entry_type = 'editing'`, `video_count = group_size`, `amount_cents = group_size * editor_rate_cents`, `description` referencing the MUX share link bundle
  - Editor rate read from `team_members.cost_rate_cents_per_hour` (fallback: a configurable per-service default in `lib/accounting/presets.ts`)
- [ ] Idempotent: re-running on the same period updates counts/amount on existing auto-rows rather than duplicating (use a stable composite key like `(period_id, client_id, editor_user_id, entry_type, source='auto')`).
- [ ] Auto-rows render with a subtle `auto` chip in the entries grid; admins can edit them and the chip flips to `auto-edited`; admins can delete them and the row is excluded from re-sync until period close.
- [ ] Surface "Sync editing from approved deliverables" button in the period detail header (super-admin only) that runs the auto-populate. Also fire automatically when a period is opened for the first time.
- [ ] Typecheck + lint pass.
- [ ] Verify in browser using dev-browser skill.

### US-005: Flag out-of-scope deliveries in editor + accounting views

**Description:** As an admin, I want over-scope deliveries flagged so I can decide whether to charge the client, eat the cost, or expand the package, without approving them silently.

**Acceptance Criteria:**
- [ ] When `approved > capacity` for a `(client, service, period)`, surface a "X over scope" pill on:
  - `<DeliverableProgress>` strip (US-003)
  - `<ServiceCapacityPanel>` (US-002)
  - The client's row in the accounting period detail's editing tab
- [ ] The pill links to a lightweight "Out of scope this period" dialog listing each over-scope deliverable with its approved-at timestamp and the editor.
- [ ] Dialog has two read-only states only ("noted, will handle" / "open a credit pack"); no auto-charge in v1. Picking "open a credit pack" opens the existing top-up admin flow in a new tab.
- [ ] Dialog state is persisted in a new `deliverable_overage_reviews` table (see schema in §7) so the same period doesn't re-prompt after a decision.
- [ ] Typecheck + lint pass.
- [ ] Verify in browser using dev-browser skill.

### US-006: Remove Revenue from admin sidebar

**Description:** As Jack, I want the Revenue entry gone from the sidebar because the Revenue Hub isn't where we focus right now.

**Acceptance Criteria:**
- [ ] Delete the `{ href: '/admin/revenue', label: 'Revenue', icon: CreditCard }` line from `components/layout/admin-sidebar.tsx` (currently line 170).
- [ ] If `CreditCard` from `lucide-react` is no longer imported elsewhere in the file, remove the import. Otherwise leave it.
- [ ] Do NOT delete the `/admin/revenue` route itself (still reachable by direct URL; we may resurrect later).
- [ ] Verify in browser using dev-browser skill (sidebar renders without gap, no console error).
- [ ] Typecheck + lint pass.

### US-007: Capacity reads in API routes are org-scoped

**Description:** As a portal user, I should never see capacity data for a client outside my org (we don't currently expose this on the portal, but the API route must still scope correctly).

**Acceptance Criteria:**
- [ ] `GET /api/clients/[clientId]/capacity` performs the standard portal-scoping pattern from `CLAUDE.md` (admin = unfiltered; viewer = `eq('clients.organization_id', userData.organization_id)`).
- [ ] Route validates `service` query param via Zod against the literal union `'editing' | 'smm' | 'blogging'`.
- [ ] Response shape: `{ service, capacity, approved, period_start, period_end, source }`.
- [ ] Typecheck + lint pass.

## 5. Functional Requirements

- **FR-1** Add a `deliverables` jsonb column (or extend the existing `tiers_preview` shape) on `proposal_templates` with the structure `{ editing: number, smm: number, blogging: number }` per tier. Migration name: `233_proposal_tier_deliverables.sql` (230-232 already taken by other features). Backfill the three existing Editing Packages tiers with hard-coded counts (Essentials = 4, Studio = 8, Full Social = 12; confirm in implementation).
- **FR-2** `lib/clients/get-service-capacity.ts` returns the resolved monthly capacity for every service the client has enabled, sourced from the latest signed proposal where possible.
- **FR-3** `GET /api/clients/[clientId]/capacity?service=editing|smm|blogging` returns capacity + approved-count for the current accounting period.
- **FR-4** `<ServiceCapacityPanel>` renders on `/admin/clients/[slug]/settings` and shows one row per enabled service.
- **FR-5** `<DeliverableProgress>` renders on the editor's MUX-final upload page (component is reusable; same one mounts on the panel and the upload page with different layouts).
- **FR-6** `lib/accounting/auto-populate-editing.ts` upserts editing payroll rows from approved deliverables. Idempotent. Source = `'auto'`.
- **FR-7** Period detail header gets a "Sync editing from approved deliverables" button (super-admin) that calls FR-6 for the current period; also fires automatically the first time a period is opened.
- **FR-8** `payroll_entries` gains a `source` text column (`'manual' | 'auto' | 'auto-edited'`, default `'manual'`). Migration `234_payroll_entries_source.sql`.
- **FR-9** `deliverable_overage_reviews` table tracks the admin decision per `(client_id, service, period_id)`. Migration `235_deliverable_overage_reviews.sql`.
- **FR-10** Out-of-scope pill renders in the three locations listed in US-005.
- **FR-11** Revenue entry removed from admin sidebar; route file kept on disk.
- **FR-12** No client-visible UI added by this PRD speaks the word "credits" (per the directional pivot rule).

## 6. Design Considerations

- Reuse `IconCard` from `project_section_card_design_system` for the new panel; reuse the existing `Pill` / `Badge` primitives for the "auto" + "X over scope" chips. No new component primitives.
- Match `/admin/calendar` for spacing/density on `<DeliverableProgress>`.
- Service icons stay consistent with existing usage (whatever the calendar + content section pages already use for editing/SMM/blogging).
- Out-of-scope dialog reuses the existing modal primitive on the accounting period; do not introduce a new dialog stack.
- Sentence case in product UI for all new copy. No em dashes anywhere (CLAUDE.md hard rule).
- Tone: factual and operational, never "billing-y" — "10 edits delivered" not "10 credits used."

## 7. Technical Considerations

### Schema additions

```sql
-- Migration 233_proposal_tier_deliverables.sql
-- (No DDL needed if we extend tiers_preview jsonb; we only document the shape.)
-- Each tier in proposal_templates.tiers_preview gains:
--   { ..., "deliverables": { "editing": 4, "smm": 60, "blogging": 0 } }
-- Backfill the three Editing Packages tiers via a one-time UPDATE.

-- Migration 234_payroll_entries_source.sql
ALTER TABLE payroll_entries
  ADD COLUMN source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto', 'auto-edited'));

CREATE UNIQUE INDEX idx_payroll_entries_auto_dedup
  ON payroll_entries (period_id, client_id, team_member_id, entry_type)
  WHERE source IN ('auto', 'auto-edited');

-- Migration 235_deliverable_overage_reviews.sql
CREATE TABLE deliverable_overage_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service text NOT NULL CHECK (service IN ('editing', 'smm', 'blogging')),
  period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('noted', 'top_up_opened')),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (client_id, service, period_id)
);
ALTER TABLE deliverable_overage_reviews ENABLE ROW LEVEL SECURITY;
-- Admin-only: no viewer policy. (Internal accounting concept.)
CREATE POLICY "admin_all" ON deliverable_overage_reviews
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin'))
  );
```

### Query plan

- The capacity helper joins `proposals` (latest by `signed_at`) → `proposal_templates.tiers_preview` jsonb extraction. Keep this in app code, not a view, since the jsonb path is per-tier-key.
- The "approved this period" count joins `deliverable_transactions` (kind='consume', service-mapped charge_unit_kind) on `created_at` between period bounds. Index `idx_deliverable_tx_client_kind_created` should already exist (verify in implementation; add if missing).
- `autoPopulateEditingForPeriod` runs in a single transaction; conflict target = the partial unique index from migration 231.

### Failure modes to handle

- Client has no signed proposal → fall back to defaults, mark `source: 'default'`. Do NOT silently treat as 0 capacity in the editor view (would hide it).
- Tier has no `deliverables` block in `tiers_preview` (legacy templates) → treat as 0 for that service, but the panel renders the "configure in proposal" hint.
- Editor ID is null on a `consume` row (legacy data) → group those under a synthetic "Unattributed" team_member_id label so they still get a row; admin can re-attribute.
- Sync button hit twice in <2s → second call is a no-op via the unique index.

### Reuse, don't reinvent

- `lib/credits/comment-hooks.ts` already writes the consume rows on approval. Don't change that path.
- `EntriesGrid` already supports per-tab service filtering (Phase A of the accounting revamp). The auto chip is a small render-only addition to existing rows.
- Use `getStripe(agency)` if the "open a credit pack" link goes anywhere Stripe-touching.

## 8. Success Metrics

- 100% of approved editing deliverables in a period appear as a payroll row when the period is opened (vs ~0% today).
- Editor self-reports they don't need to ask "how many videos does this client get this month" anymore.
- Out-of-scope dialog records ≥1 decision per overage event in real periods (proves the surface is being used, not bypassed).
- Zero portal-facing surfaces show the word "credits" after this PRD lands (manual sweep).

## 9. Open Questions

These are flagged for the implementation pass; they don't block starting the loop.

- **OQ-1** Editor's upload page route — confirm during Phase 1 (likely under `/admin/...` with a token-gated public sibling). Search `mux` + `final_video_url` write paths to find it.
- **OQ-2** Editor rate: is `team_members.cost_rate_cents_per_hour` always populated for active editors (Jed, Ken)? If not, set defaults during the migration's pre-check.
- **OQ-3** Should the `deliverable_overage_reviews` unique constraint key on `(client, service, period)` allow an admin to reset a "noted" decision back to "open"? V1 = no (one decision per period); fine to revisit.
- **OQ-4** Auto-attribution falls back to `team_members` when `editor_user_id` is null on a consume row. Confirm `team_members.id` is what `payroll_entries.team_member_id` already references.

## 10. Phases (ralph-loop order)

Each phase ends with: `npx tsc --noEmit` + `npm run lint` + browser smoke + commit + push to main.

### Phase 1 — Sidebar cleanup (smallest, safest)

US-006. Single-line sidebar removal + import audit. ~5 min.

### Phase 2 — Capacity model + helper

FR-1, FR-2, US-001. Migration 230, helper module + unit tests, default-fallback module. No UI yet.

### Phase 3 — Capacity API + portal scoping

FR-3, US-007. New `GET /api/clients/[clientId]/capacity` route with Zod + portal scoping.

### Phase 4 — ServiceCapacityPanel on client settings

FR-4, US-002. Mount the panel; reuse IconCard. Includes the "from proposal / from default" badge and the configure hint.

### Phase 5 — DeliverableProgress on editor upload page

FR-5, US-003. Identify the upload route (OQ-1), mount the strip, wire the warning state.

### Phase 6 — Payroll source column + auto-populate engine

FR-6, FR-7, FR-8, US-004. Migration 231, the auto-populate module, period detail "Sync" button, the `auto` / `auto-edited` chips on entries grid rows.

### Phase 7 — Out-of-scope flagging

FR-9, FR-10, US-005. Migration 232, pill in three places, dialog with the two decision states.

### Phase 8 — Final sweep

- Manually verify no client-visible surface added by Phases 1-7 leaks the word "credits."
- Confirm the auto-populate handles the legacy "Unattributed" path on a real period.
- Add a one-line entry to `docs/database.md` for migrations 230-232.
- Add a one-line entry to `docs/architecture.md` referencing `lib/clients/get-service-capacity.ts` as the single source of truth for capacity.

## Verify gates per phase

After each phase:
1. `npx tsc --noEmit`
2. `npm run lint`
3. Browser smoke test (every UI phase; skip on Phase 1 sidebar removal it's still useful).
4. Visual density check vs sibling pages (`/admin/calendar`, `/admin/accounting/[periodId]`, `/admin/clients/[slug]/settings`).
5. Commit with scoped message; push to main per `feedback_push_main_only.md`.

## Out of scope for this loop (do not chase)

- Stripe overage auto-charging.
- A new "Capacity" admin sidebar entry (the panel on the client settings page is the surface; no top-level nav).
- Per-day or per-week capacity (monthly only in v1).
- Replacing the existing SMM auto-fill (it works; we're adding editing, not redoing SMM).
- Touching `/admin/revenue` route content (just removing the sidebar link).
- Blogging-specific auto-accounting rows (capacity visibility only this loop).
