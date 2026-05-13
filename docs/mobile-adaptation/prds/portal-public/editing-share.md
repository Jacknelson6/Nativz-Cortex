# Editing share — Mobile PRD

**Routes:** `/c/edit/[token]`, `/c/edit/[token]/download`
**Actor:** public (token-gated)
**Surface:** Editing project review share link.

## Purpose
Public share link for editing deliverables. Clients view finished cuts, comment, approve. High mobile traffic.

## Desktop UI (UNCHANGED)
- Project header at top with KPI strip (cuts ready, in revision, approved).
- Video card grid per deliverable.
- Comment panel per video.
- `/download` page: asset grid with per-cut downloads (same big-centered-button pattern as calendar share).

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5**

### `/c/edit/[token]`
- Project header → single-row KPI with the 3 main stats. Sticky on scroll.
- Video cards stack 1-up. Each card:
  - Video thumbnail with play overlay (16:9 or 9:16 depending on cut format) full-width
  - Title + revision count
  - Action row: Approve (primary) / Request revision (secondary) / Comment
  - Tap video → opens player sheet (full-screen)
- Comment thread → bottom sheet (T5).
- Approve-all CTA sticky at bottom.

### `/c/edit/[token]/download`
- Mirrors calendar share download page treatment.

## Touch & sizing
- Play overlay 64 × 64.
- Approve / Revision actions: 48px tall.

## Out of scope
- Frame-level timestamped comments on mobile (long-press → "comment at this timestamp" sheet).

## Acceptance criteria
- Client can approve 5 cuts on phone in 60s.
- Video plays inline on iOS Safari.
- Desktop diff = 0 at `lg+`.
