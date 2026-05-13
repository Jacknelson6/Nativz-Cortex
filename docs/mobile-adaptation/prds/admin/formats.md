# Formats library — Mobile PRD

**Routes:** `/admin/formats`, `/admin/formats/[id]`, `/admin/formats/rejected`, `/admin/formats/taxonomy`
**Actor:** admin
**Sidebar:** Not in sidebar.

## Purpose
Cross-brand viral-formats library. Approve / reject formats discovered by the pipeline; manage taxonomy.

## Desktop UI (UNCHANGED)
- Format card grid with thumbnails.
- Format detail page with examples, scoring, taxonomy tags.
- Taxonomy admin: tree editor for categories.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5, T6**

### List (`/formats`)
- Card grid → 2-up at `sm+`, 1-up below `sm`.
- Filter chips (status, category) as pill row (T6).

### Detail (`[id]`)
- Hero thumbnail full-width. Below: format name, score, examples carousel (horizontal scroll), taxonomy chips.
- Approve / Reject CTAs sticky bottom row.

### Rejected
- Mirror list pattern; sticky "Restore" action per card.

### Taxonomy
- Tree → list of categories with indent chevrons. Tap chevron to expand. Edit via sheet.

## Out of scope
- Drag-to-reorder taxonomy on mobile (long-press → up/down sheet).

## Acceptance criteria
- Approve action firable in 2 taps from list.
- Desktop diff = 0 at `lg+`.
