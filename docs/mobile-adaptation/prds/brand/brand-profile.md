# Brand Profile — Mobile PRD

**Route:** `/brand-profile`
**Actor:** admin (edit), viewer (read-only)
**Sidebar:** Brand tools → Brand Profile

## Purpose
The brand's source of truth: identity (name, logo, taglines, mission), audience, products, brand voice, banned phrases, primary location, posting timezone, etc. Drives every AI prompt across Cortex.

## Desktop UI (UNCHANGED)
- Two-column form layout. Left column logo+name+description+aliases. Right column sections for audience, voice, location, etc.
- Each section uses the `SectionPanel` primitive (see `docs/detail-design-patterns.md`); pencil-icon edit affordance per row.
- Logo upload via drag-drop zone.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5, T7**

### Layout
- Two columns → single column. Sections stack in the existing order.
- Section header gets sticky behavior on scroll, so the user always knows which section they're in.
- `SectionPanel`s keep their visual identity; ensure `max-lg:p-4` for breathing room on small screens.

### Edit interactions
- Pencil-icon (hover-revealed on desktop) → persistent on mobile (T7). 32 × 32, top-right of the row.
- Tapping a row → opens an edit sheet (T5) with the form field(s) for that row + Save/Cancel sticky footer.
- Multi-row sections (e.g. banned phrases, brand aliases, products) — each entry has its own card on mobile; "Add" button at the bottom of the section.

### Logo upload
- Drag-drop zone keeps a tap-to-upload affordance always on. Camera access prompt iOS handles natively.
- Crop sheet appears after upload; bottom sheet with a square / 1:1 crop tool.

### Voice / writing-style preview
- The voice "sample copy" preview that desktop renders inline → tap "Preview voice" button to open it as a sheet on mobile.

## Touch & sizing
- Input fields: 48px tall, 16px font.
- Save action sticky footer in edit sheets, full-width.

## Out of scope
- Bulk edit across multiple sections at once.
- The brand DNA "regenerate from scratch" power action — accessible from a kebab in the header on mobile, but the run-confirmation interstitial is desktop-grade copy.

## Acceptance criteria
- Editing the brand name, then voice, then banned phrases is doable in 3 sheet round-trips.
- Logo upload + crop works on iOS Safari.
- Desktop diff = 0 at `lg+`.
