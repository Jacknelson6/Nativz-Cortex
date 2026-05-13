# Nerd — Mobile PRD

**Routes:** `/admin/nerd`, `/admin/nerd/settings`
**Actor:** admin
**Sidebar:** Not in sidebar; reach via top-bar API docs link.

## Purpose
Developer surface: auto-generated API reference, skills system editor, guardrail rules. Read-mostly.

## Desktop UI (UNCHANGED)
- Card UI of API routes grouped by domain. Click to expand route detail (method, params, response schema).
- Skills system at `/nerd/settings`: list of skill markdown files, edit inline.
- Guardrails list.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5**

### `/nerd`
- Card grid → 1-up. Each route card stays as a card; tap expands to full details.
- Search input sticky in header.
- Filter by tag/method (GET / POST / etc.) as pill row.

### `/nerd/settings`
- List of skills (cards). Tap to view skill content.
- Edit on mobile: read-only by default; "Edit on desktop" hint, since skill markdown editing benefits from large canvas.

## Out of scope
- Inline markdown skill editing.
- Live API testing playground.

## Acceptance criteria
- API route discovery + reading is fully usable on mobile.
- Desktop diff = 0 at `lg+`.
