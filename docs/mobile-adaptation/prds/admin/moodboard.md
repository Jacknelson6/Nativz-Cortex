# Moodboard — Mobile PRD

**Route:** `/admin/moodboard/[id]`
**Actor:** admin
**Sidebar:** Not in sidebar.

## Purpose
AI video analysis moodboard. Visualizes the parsed structure of a video reference: scenes, transitions, audio, hooks.

## Desktop UI (UNCHANGED)
- Multi-pane layout: video player + scrubber, scene timeline, AI-parsed structure panels.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5**

### Layout
- Video player full-width at top, max-height 60vw (16:9 within mobile width).
- Scene timeline becomes a horizontal-scroll thumbnail strip below the player.
- AI-parsed sections (hook, beats, audio analysis) stack vertically below.
- "Open in" deep-links (use in calendar / save to brand) as sticky bottom row.

## Out of scope
- Frame-level scrubbing precision (use timeline thumbs as the primary navigation).

## Acceptance criteria
- Video plays inline on iOS Safari.
- Scrub interaction works with one thumb.
- Desktop diff = 0 at `lg+`.
