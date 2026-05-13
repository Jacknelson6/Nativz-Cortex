# Tools — Mobile PRD

**Route:** `/admin/tools`
**Actor:** admin / super-admin
**Sidebar:** Not in sidebar (orphaned).

## Purpose
Internal one-off tools page. Misc utilities the team uses occasionally.

## Desktop UI (UNCHANGED)
- Grid of utility tiles, each linking to a one-off internal tool or invoking a server action.

## Mobile transformations
**Apply from playbook: T1, T2, T3**

### Layout
- Tile grid → 1-up card list. Each card shows the tool name, short description, primary action button.
- Group cards by category if more than 8 tiles.

## Out of scope
- Specific power utilities that need a large canvas — they get "best viewed on desktop" interstitial.

## Acceptance criteria
- Every tile is tappable and triggers its action.
- Desktop diff = 0 at `lg+`.
