# Ad Generator — Mobile PRD

**Routes:** `/ads`, `/ads/batches/[batchId]`
**Actor:** admin (brand-scoped; lives in Admin section because each run burns Gemini credits)
**Sidebar:** Admin → Ad Generator

## Purpose
Generate static-image Meta ads from Kandy templates. Pick template style + brand context, AI produces image + copy variants in a batch.

## Desktop UI (UNCHANGED)
- **`/ads`:** template gallery — grid of Kandy template styles, click to enter brief, then "generate batch" CTA. Lower section: recent batches list.
- **`/ads/batches/[batchId]`:** grid of generated variants. Each variant has the rendered image, AI-generated headline + body, edit / regenerate / approve actions.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5, T6**

### `/ads` (template gallery + brief)
- Template grid: 3-up on desktop → 2-up on mobile (`max-lg:grid-cols-2`), or 1-up at very small widths.
- Template card: keep square thumbnail; tap → opens brief sheet (T5).
- **Brief sheet:** required fields (audience, offer, voice mode, count), file upload (logo / asset references), "Generate" sticky CTA.
- Recent batches list: card list, each shows template thumbnail strip + count + status.

### `/ads/batches/[batchId]`
- Variant grid 1-up on mobile (each variant is a vertical-rich card). Card layout:
  - Rendered image full-width (square or 9:16 depending on template).
  - Headline + body below, larger text.
  - Action buttons: Edit / Regenerate / Approve. Approve = full-width primary; Edit + Regenerate share a row above it.
- "Filter variants" + sort options in the sticky header → bottom sheet.
- Edit copy → opens a form sheet with headline + body textareas.

### Generation status
- During batch generation: top-of-page progress card with live count "Generated 7 / 12." Stays sticky.

## Touch & sizing
- Variant card image: full-width, max-height 60vh so the card still shows action buttons without scroll.
- "Approve" button: 56px tall, brand accent.

## Out of scope
- The fine-grained per-template style editor (visible only on desktop with "best viewed on desktop" hint on mobile).
- Cross-batch comparison.

## Acceptance criteria
- Submitting a brief + generating + approving one variant in <60s of taps.
- Generation progress visible while scrolling other variants.
- Desktop diff = 0 at `lg+`.
