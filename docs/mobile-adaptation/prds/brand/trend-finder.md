# Trend Finder — Mobile PRD

**Routes:** `/finder/new`, `/finder/[id]`, `/finder/[id]/processing`, `/finder/[id]/subtopics`
**Actor:** admin + viewer (brand-scoped)
**Sidebar:** Brand tools → Trend Finder → Trending topics

## Purpose
AI-powered short-form video topic research. User picks a brand, kicks off a search, gets a ranked topic list with sentiment, examples, and "spin into idea" actions.

## Desktop UI (UNCHANGED)
- `/finder/new`: full-width hero search bar with brand context chip, sample queries, recent searches grid.
- `/finder/[id]`: 2-column layout — left rail (search meta + filters), right (topic cards in a grid). Each card has thumbnail, title, sentiment-split-bar, source count, action buttons.
- `/finder/[id]/processing`: progress steps + live log stream while the pipeline runs.
- `/finder/[id]/subtopics`: drill-down list when a user clicks "show me sub-angles."

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5, T7**

### `/finder/new` (search landing)
- Hero search bar already centers; ensure `max-lg:px-4 max-lg:text-base` so it fills the screen without overflow.
- Sample-query and recent-search grids collapse to single-column stacks (`max-lg:grid-cols-1`).
- Brand context chip moves from inline-with-input to a label above the input on mobile.

### `/finder/[id]` (results)
- **Layout flip:** left rail becomes a sheet. Filter button in the sticky header opens it from the bottom (T5). Active filter chips render as a horizontal-scroll row immediately below the header.
- Topic cards stack single-column. Thumbnail full-width (16:9). Sentiment-split-bar stays as-is (keep emerald/red — already memorized exception). Action buttons (Spin into idea / Save / Share) stack vertically inside each card; primary action is full-width.
- "Show subtopics" link in each card becomes a tappable footer band, 44px tall.
- Sort/order dropdown moves to a segmented control in the sticky header for the two most common modes (Relevance, Recency).

### `/finder/[id]/processing`
- Progress steps stack vertically as a checklist (already mostly mobile-friendly). Log stream uses smaller `max-lg:text-xs` and constrains height to 40vh with internal scroll.

### `/finder/[id]/subtopics`
- Same card-stack treatment as results page.

## Touch & sizing
- Card tap target = entire card (already on desktop; ensure no nested click traps on mobile).
- "Spin into idea" button: full-width, 48px tall, primary accent.
- Filter chip row: 36px tall pills, 8px gaps, momentum scroll.

## Out of scope
- Bulk-select operations (Cmd-click on desktop) are not mirrored — single-select only on mobile.
- The "compare topics side-by-side" power feature renders best-viewed interstitial below `sm`.

## Acceptance criteria
- Search → results → spin into idea is one-handed thumb-only on iPhone SE.
- Desktop diff = 0 at `lg+`.
- Filter sheet opens with smooth spring animation; tap outside dismisses.
- No horizontal scrolling at 375px width except the deliberate filter-chip row.
