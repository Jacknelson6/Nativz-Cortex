# Notes — Mobile PRD

**Routes:** `/notes`, `/notes/[id]`
**Actor:** admin + viewer (brand-scoped)
**Sidebar:** Brand tools → Notes

## Purpose
Per-brand notes / scratch pad. Free-form markdown, tagged, searchable. Feeds the semantic memory layer.

## Desktop UI (UNCHANGED)
- 2-pane: left list of note cards (title, last-edit, tag chips); right pane is the active note editor (markdown).
- "New note" button at top of list.
- Inline search filters the list.

## Mobile transformations
**Apply from playbook: T1, T2, T3**

### `/notes` list
- Single column card list. Cards: title (top), 2-line preview, last-edit timestamp, tag chips (horizontal scroll if overflow).
- Search input pinned at top below the page header. Sticky.
- "New note" FAB bottom-right.

### `/notes/[id]` editor
- Full-screen editor on mobile. Page header collapses to back-chevron + title (editable inline) + kebab (delete / share / set tags).
- Tag chip row below title.
- Markdown editor fills the rest of the viewport. Composer toolbar (bold, italic, link, image) collapses to a single "format" button that opens a sheet with format options.
- Keyboard accessory bar (suggested when iOS keyboard is up): outline / heading / list / link shortcuts.

### Save model
- Autosave already on (desktop). Surface "saved" indicator in the header on mobile. Manual save not needed.

## Touch & sizing
- Card tap target: full card.
- Tag chips: 28px tall, tap to filter.

## Out of scope
- Side-by-side preview vs edit (mobile collapses to edit-mode with a "preview" toggle in the kebab).

## Acceptance criteria
- Creating, tagging, and saving a 200-word note is doable one-handed.
- Switching between notes via the list takes one tap.
- Desktop diff = 0 at `lg+`.
