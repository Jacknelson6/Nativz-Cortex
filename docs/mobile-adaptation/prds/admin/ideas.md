# Ideas — Mobile PRD

**Routes:** `/admin/ideas`, `/admin/ideas/generate`, `/admin/ideas/[id]`
**Actor:** admin
**Sidebar:** Not in sidebar.

## Purpose
Cross-brand idea bank. Stores generated ideas (from topic searches, lab, manual) and the "Generate ideas" wizard.

## Desktop UI (UNCHANGED)
- List of idea cards with brand chip, hook, format tags.
- Detail page with full idea body, scripts, references.
- Generate page: form to kick off idea generation.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5, T6**

### List
- Card list with brand chip, hook (top, bold), 2-line description, tag chips.
- Search + filter pills (brand, format, status).

### Detail
- Single-column. Hero hook, sections for full script, references, related entities. Action buttons (Edit, Use in calendar, Save) as sticky bottom row.

### Generate
- Wizard form. Stepper at top, sticky Continue button.

## Out of scope
- Bulk approve / delete.

## Acceptance criteria
- "Use in calendar" deep-links to `/calendar/new?from=idea:[id]` with state preserved.
- Desktop diff = 0 at `lg+`.
