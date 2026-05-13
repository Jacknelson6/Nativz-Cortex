# Account (admin) — Mobile PRD

**Route:** `/admin/account`
**Actor:** admin (self)
**Sidebar:** Not in sidebar.

## Purpose
Legacy admin "my account" page. Note: per memory `project_settings_restructure`, account-related stuff moved to the avatar popover; this page is partially superseded.

## Desktop UI (UNCHANGED)
- Profile fields, avatar upload, password reset.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5**

### Layout
- Single-column form. Avatar upload at top. Field rows tap to edit via sheet.

## Notes
- Consider redirecting `/admin/account` to the avatar popover on the (app) layout, since the popover already owns account on desktop and mobile. Out of scope for this PRD but flag in cleanup.

## Out of scope
- Re-implementing the legacy fields that the popover replaced.

## Acceptance criteria
- Page still loads if linked to.
- Desktop diff = 0 at `lg+`.
