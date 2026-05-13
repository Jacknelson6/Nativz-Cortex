# Present mode — Mobile PRD

**Routes:** `/present/[token]`, `/admin/presentations/[id]/present`
**Actor:** public + admin
**Surface:** Fullscreen presentation player.

## Purpose
Present a slide deck to a client (live or async).

## Desktop UI (UNCHANGED)
- Fullscreen slide viewer. Arrow keys to advance. Mouse-corner reveals next/prev controls.

## Mobile adaptation
**Apply from playbook: minimal. This is an explicit out-of-scope per the playbook.**

### Behavior on phone
- Slides render in a swipe-paged carousel (one slide per page).
- Tap top-right to exit.
- Tap-and-hold reveals a slide-counter pill (current / total).
- Audio narration (if present in deck) plays inline; pause/play button persistent bottom-center.

### Notes
- Composition/editing is **not** supported on phone (see `/admin/presentations` PRD).
- A tablet (≥ 768px) gets the same treatment as desktop. No bespoke tablet layout.

## Out of scope
- Drawing annotations on slides during present.
- Live multi-attendee presence.

## Acceptance criteria
- Slides swipe smoothly with momentum.
- Audio doesn't auto-play (iOS policy); needs a first-tap to start.
- Desktop diff = 0 at `lg+`.
