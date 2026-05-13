# Calendar share — Mobile PRD

**Routes:** `/c/[token]`, `/c/[token]/download`
**Actor:** public (token-gated)
**Surface:** Public share link sent to clients for review/approval.

## Purpose
The biggest public-facing surface. Clients view scheduled content, comment, approve. Highest mobile traffic because clients are frequently on phones when they receive the share email.

## Desktop UI (UNCHANGED)
- Calendar overview at top with KPI strip (count by status, "approve all" CTA).
- Drop grid: cards per drop showing platform mockups + caption + media.
- Comment panel per drop (slides in).
- `/download` page: thumbnail grid per asset with hover-revealed Download button (recently redesigned to centered big "Download" button — see commit `51a625c2`).

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5, T6**

### `/c/[token]` (review page)
- KPI strip → 2-up grid. "Approve all" sticky CTA at the bottom of the viewport (above iOS home indicator).
- Drop cards stack 1-up. Each card:
  - Brand chip + scheduled date at top
  - Platform tabs (horizontal pill row T6) — tap to switch between Instagram / TikTok / etc. mockups
  - 9:16 or 1:1 mockup full-width
  - Caption preview below (collapsed to 4 lines with "more")
  - Action row: Approve (primary, full-width), Comment (secondary)
- Comment thread → opens as a bottom sheet (T5) when "Comment" is tapped. Composer pinned at sheet bottom above keyboard.

### `/c/[token]/download`
- Already partially adapted (per recent commit). Verify:
  - Big centered Download button works at mobile widths
  - Thumbnail tiles stack as 1-up cards
  - Per-card Download has a single tap → triggers blob download
  - Bulk "Download all" sticky bottom CTA

### Approval flow
- "Approve all" → confirm sheet with summary + check box for "I've reviewed every post."
- Per-drop approve → single tap, optimistic update, undo affordance for 5s.

## Touch & sizing
- Download buttons: 56px tall, brand accent.
- Caption "more" expand: full-row tap target.

## Out of scope
- Editing captions on the share view (intentional; clients only review).

## Acceptance criteria
- A client can review and approve 10 drops on phone in under 3 minutes.
- Approve-all confirm sheet is unmissable.
- Download all triggers a single zip download (existing behavior).
- Desktop diff = 0 at `lg+`.
