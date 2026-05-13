# Users — Mobile PRD

**Route:** `/admin/users`
**Actor:** admin / super-admin
**Sidebar:** Admin → Users

## Purpose
Platform user management. Lists all users (admins + viewers), roles, last-active, organization, access. Invite, change role, deactivate.

## Desktop UI (UNCHANGED)
- Table with columns: avatar, name, email, role pill, org, last active, kebab (resend invite, change role, deactivate).
- Search + filter (role, org, status) at top.
- "Invite user" CTA in header.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5, T6**

### List
- Table → card list. Card: avatar (40 × 40), name (top, bold), email (secondary), role pill, org name, last active relative, kebab.
- Search input below page header (sticky).
- Filter pills (Admins / Viewers / Inactive) (T6).

### Invite
- "Invite" header button → opens invite sheet (T5): email input, role select, org select (if super-admin), optional client access. Sticky bottom Send.

### Per-user actions
- Kebab opens sheet: Resend invite / Change role / View user / Deactivate. Destructive actions two-step confirm.

## Touch & sizing
- User card: 80px tall.
- Role pill: tap to filter by that role.

## Out of scope
- Bulk operations across users.
- The impersonate-as-user flow on mobile (best on desktop; show "best viewed on desktop" hint when triggered from mobile).

## Acceptance criteria
- Invite flow completes in <30s on phone.
- Search filters list optimistically.
- Desktop diff = 0 at `lg+`.
