# Share Links — Mobile PRD

**Route:** `/admin/share-links`
**Actor:** admin
**Sidebar:** Not in sidebar.

## Purpose
Cross-brand oversight of every share link minted by Cortex (calendar shares, editing shares, audit reports, prospect decks, etc.). Last viewed, comments, approval state.

## Desktop UI (UNCHANGED)
- Table with columns: kind (calendar / editing / report), client, token, last viewed, comment count, status, kebab.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5, T6**

### List
- Table → card list. Card: kind icon, client + title, last viewed relative, comment count badge, status pill, kebab (Open / Copy URL / Resend / Revoke).
- Filter chip row: All / Calendar / Editing / Reports / Prospect / Expired (T6).

### Per-link
- Tap card → opens link detail sheet (T5) showing full URL, copy button, view count timeline, comment list, action buttons.

## Out of scope
- Bulk revoke.

## Acceptance criteria
- Copy URL works on iOS Safari clipboard API.
- Revoke action confirms before firing.
- Desktop diff = 0 at `lg+`.
