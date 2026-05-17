# PRD 06 — Team

## Goal

Pick the strategist and editor assigned to this brand. Smaller than Users — this is the *Nativz-side* team, not the *client-side* team.

## Data model

`clients.default_strategist_id` and `clients.default_editor_id` already exist. References `team_members.id`.

`client_team_assignments` table also exists (migration 227 era) with role + is_primary, supporting account_manager / strategist / smm / editor / videographer / poc. For now we only surface strategist + editor on the profile; the broader assignments table is read by the editing-project pipeline.

## UI spec

Two `WorkspaceSection` cards:

1. **Strategist** — current strategist row with avatar, name, email, replace button. Empty state: "No strategist assigned — drops won't auto-route."
2. **Editor** — same shape

Picker: shadcn `<Combobox>` over active `team_members` rows where `role in ('strategist','editor')` (filtered by section).

## API

Existing PATCH on `/api/admin/clients/[slug]` accepts `default_strategist_id` and `default_editor_id` — no new endpoint.

## Done criteria

- [ ] Read state shows avatar + name + email + role pill
- [ ] Picker filters by role
- [ ] Clearing the picker writes `null`
- [ ] Anchors: `/profile/team#strategist`, `/profile/team#editor`

## Out of scope

- Account manager / videographer / SMM slots — defer to a "Wider team" sub-card later if the editing-project pipeline ever needs admin override
