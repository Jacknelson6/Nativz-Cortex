# PRD: Spying → Prospect Pipeline, Phase 01 — Prospect Entity & Scaffolding

> Series: Spying / Prospect Pipeline · 01/10 · Draft 2026-05-10

## Purpose & Value

Today, the audit and spying tools treat every analyzed brand as either an attached client or a one-off scrape. That blocks the bigger workflow: spying becomes a sales engine where every interesting brand becomes a tracked prospect, every prospect can convert to a client, and conversion preserves history. This phase introduces the `prospects` entity that the rest of the series builds on.

## Problem

Right now an audit row lives in a vacuum. There's no "this is a prospect we're courting; here's their lifecycle stage; here's what we've sent them." Without a prospect entity, we can't run the rankprompt-style sales motion the rest of this series unlocks.

## Primary User

Internal sales / strategist (admin). Prospects don't get login access in this phase.

## Goals (SMART)

- Migration deployed within 2 days, prospects entity reachable at `/admin/prospects`.
- Existing audit-only flows preserved; new flow opt-in via "Save as prospect" affordance on an audit.
- 100% of new prospect rows pass RLS smoke (admin write, viewer no access).
- Zero regressions to `/spying/audits/[id]` or `/admin/audit` flows.

## User Stories

- **US-01** — As an admin, I can save an audit's brand as a prospect with one click from the audit report header.
- **US-02** — As an admin, I can browse `/admin/prospects` and see all tracked prospects with stage, last-touchpoint, and last-audit-date columns.
- **US-03** — As an admin, I can edit a prospect's stage (e.g. discovered → audited → in_outreach → demo_scheduled → converted → lost).
- **US-04** — As a developer, I can query `prospects` joined to `audits` to see every audit for a prospect.

## In Scope

- Migration `170_prospects.sql`:
  - `prospects` (id, brand_name, primary_url, primary_platform, stage enum, owner_user_id, source enum: `audit` | `manual` | `import`, notes text, created_at, updated_at, converted_to_client_id nullable FK, lost_reason nullable).
  - `prospect_socials` (prospect_id, platform, profile_url, username, confirmed_at).
  - `prospect_touchpoints` (id, prospect_id, kind enum: `audit_sent` | `email` | `call` | `demo` | `proposal_sent` | `note`, content text, occurred_at, created_by).
- RLS: admins full CRUD; viewers no access (prospect data never reaches portal).
- Sidebar: `/admin/prospects` under the new "Sales" or existing Intelligence section (decide based on density).
- "Save as prospect" button on `components/audit/audit-report.tsx` header.
- Audit ↔ prospect link via new `prospect_id` nullable column on `prospect_audits` (rename if needed) or via join table.

## Out of Scope

- Email composition / sending (later phase).
- Quick-onboarding UX (SPY-02).
- Initial analysis automation (SPY-03).
- Conversion mechanics (SPY-07).

## Architecture Wiring

- Reuses `prospect_audits` table conceptually but adds prospect FK.
- Sidebar entry: `components/layout/admin-sidebar.tsx` Title Case.
- `getPortalClient()` continues to refuse access (no portal route added).
- Activity log: every stage transition writes to `activity_log` for audit trail.

## Open Questions

1. Should prospects ever be assigned to non-admin team members? (Default: admins only in v1; broaden when the team's bigger.)
2. Stage transitions: free-form ordering, or strict forward-only? (Default: free-form — sales is messy; a "lost" prospect can re-emerge.)
3. Where do we surface "auto-discovered" prospects (e.g. from VFF competitor pulls)? (Default: out of scope for v1; manual save only.)

## Assumptions

- Existing `prospect_audits` table is the right name to keep (renaming risks breaking the audit URL space).
- ~50 prospects/month is the realistic load; we don't need pagination v1.
- Stages will iterate; design the enum loose enough to add stages without migrations.

## Done When

- Migration applied.
- "Save as prospect" works from audit header.
- `/admin/prospects` list renders with sortable columns + filter by stage.
- Sidebar entry highlights when active.
- `npx tsc --noEmit` clean.
