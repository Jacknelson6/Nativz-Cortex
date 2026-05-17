# PRD 02 — Overview

**Status:** Shipped (`ba3d286b`).

## Goal

A single "at-a-glance" page that lets a new strategist load the brand's basics in 30 seconds, with a hover-to-edit affordance jumping straight to the relevant editor.

## Layout

Workspace-settings style: a vertical stack of label-left / value-right rows grouped into sections. Section headers carry a quiet "Open" link for keyboard users.

| Section | Rows |
|---|---|
| Identity | Brand name, Website, Industry, Lifecycle, Agency, Logo, Description |
| Voice & captions | Brand voice, Target audience, Caption CTA, Hashtags |
| People | Strategist, Editor, Users (contacts + invites) |
| Operations | Brand assets count, Onboardings count |

## Data fetched (one round trip)

- `clients` row — identity + voice + caption fields
- `team_members` for strategist + editor by id
- Counts (head:true): `contacts`, `invite_tokens`, `client_brand_assets`, `onboardings`

## Primitives

`components/clients/profile/workspace-section.tsx` exports:
- `WorkspaceSection({ title, description?, openHref?, openLabel? })`
- `WorkspaceRow({ label, hint?, value?, empty?, editHref?, mono?, multiline?, rightSlot? })`

Hover reveals an Edit pill on rows with `editHref`. Logo row uses `rightSlot` with `<ClientLogo size="md" />`.

## Done criteria

- [x] All rows render with correct empty states ("Not set" italic).
- [x] Edit pills route to `/profile/identity`, `/profile/team`, `/profile/users`, `/profile/assets`.
- [x] Hashtag count is the filtered length (drop empty strings).
- [x] Lifecycle uses the readable label, not the raw enum.
- [x] Counts pluralize correctly.

## Open items (deferred)

- Anchor jump (`#voice`, `#captions`) — Identity page must wire matching ids in PRD 03.
- "Run a fresh onboarding" CTA — wait for PRD 10.
