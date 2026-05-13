# Viral Formats — Mobile PRD

**Route:** `/finder/formats`
**Actor:** admin + viewer (brand-scoped)
**Sidebar:** Brand tools → Trend Finder → Viral formats

## Purpose
Netflix-style explore page of scalable, reusable viral short-form formats. User can save a format to their brand, see why it works, view example reel screenshots.

## Desktop UI (UNCHANGED)
- Horizontal-scrolling carousels grouped by category (e.g. "Hooks," "Transitions," "POVs").
- Each card shows a 9:16 example thumbnail, format name, "save to brand" action.
- Filter / category nav across the top.
- Hover reveals "details" with example links.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T6, T7**

### Layout
- Horizontal carousels stay horizontal on mobile — they're already touch-friendly. Snap to card edges (`scroll-snap-type: x mandatory` + `scroll-snap-align: start` on each card).
- Reduce card width to 70vw on mobile so the next card peeks.
- Category nav becomes the horizontal-scroll pill row pattern (T6). Active pill scrolls into view on mount.

### Card content
- Thumbnail keeps 9:16. Card height bumps to allow title + 2-line subtitle.
- "Save" button replaces hover-reveal — always visible bottom-right of the card, 40 × 40 icon button with brand swatch.
- Tap card → opens detail sheet (T5) showing example reels, why-it-works copy, longer description.

### Detail sheet
- Bottom sheet, 90vh max. Drag handle. Sections: hero thumbnail, format meta, example reels (each opens externally), why-it-works prose, "Save to [brand]" sticky CTA at bottom.

## Touch & sizing
- Save icon-button: 44 × 44, separated from card tap target.
- Detail sheet sticky CTA above iOS home indicator.

## Out of scope
- In-app video playback. Example reels open in the user's external player / IG/TikTok.
- Filter combinations beyond category (advanced filters on desktop) are hidden on mobile, replaced by category-only selection.

## Acceptance criteria
- Smooth horizontal momentum scroll, no rubber-banding on iOS.
- Detail sheet opens in <100ms from tap.
- Saved-state on card updates optimistically.
- Desktop diff = 0 at `lg+`.
