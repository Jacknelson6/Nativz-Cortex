# Presentations — Mobile PRD

**Routes:** `/admin/presentations`, `/admin/presentations/[id]`, `/admin/presentations/[id]/present`
**Actor:** admin
**Sidebar:** Not in sidebar.

## Purpose
Presentations builder. Compose slide decks for client kickoffs / strategy reviews. `/present` is the fullscreen presentation mode.

## Desktop UI (UNCHANGED)
- List of presentation cards with thumbnail + title.
- Editor: slide list left, slide canvas center, properties panel right.
- Present mode: fullscreen slide viewer with arrow keys.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5**

### List
- Card list with thumbnail + title + status.

### Editor
- **Best viewed on desktop** interstitial at top — building presentations on phone is awkward. Allow read-only mode and individual slide preview, but composition/editing is hint-only.

### Present mode (`/present`)
- Out of scope for phone (see playbook). Hint: "Use a tablet or desktop for presenting." Slides still render in a swipeable carousel for ad-hoc previewing.

## Out of scope
- Authoring presentations on phone.
- Live multi-client presenting.

## Acceptance criteria
- Presentation list browseable on mobile.
- Read-only slide preview works.
- Desktop diff = 0 at `lg+`.
