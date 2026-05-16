# PRD: CUP · 03 · SMM review surface

> CUP / 03 · drafted 2026-05-16

## Purpose & Value

This PRD ships the page the SMM lands on from a CUP-02 notification. It is an admin overlay on top of the share-link content view, with first-class controls for approve-and-send, edit-in-place, and reject. The goal is a sub-60-second path from "Slack ping" to "client got the email" on a clean drop, and a sub-2-minute path on a drop that needs a small tweak.

## Problem

- Today, "previewing what the client will see" means opening the client share link, which has zero admin controls — the SMM has to switch tabs to act on it.
- The admin calendar list lets you edit individual posts but does not give you a single approval surface for the whole drop.
- There is no in-product way to send a rejection back to the editor with a note (today it is Slack DMs).
- The action buttons (approve, edit, reject) need to be visible without scrolling on a phone screen so the SMM can act from anywhere.

## Primary User

SMM / content officer reviewing a drop on phone or laptop, often within minutes of getting the notification.

## SMART Goals

- Sub-60s approve-and-send for a clean drop (single tap, confirmation step, done).
- Edit-in-place opens the existing per-post editor without losing review context (back navigation returns to the review page with state preserved).
- Reject requires a note (min 1 char) and routes back to editor state.
- Page is mobile-responsive: header + posts list usable on a 375px viewport with the ApproveAndSendBar pinned at the bottom.
- Reuses the existing share-link content rendering component; no duplicate post-card UI.

## User Stories

- **US-01** — As an SMM, I open the notification link and see the same content the client would see, with admin controls on top.
- **US-02** — As an SMM, I tap "Approve and send" and confirm to fire the existing share/send route (CUP-01 D-02).
- **US-03** — As an SMM, I tap "Edit" on a single post and land in the existing post editor; saving returns me to the review page.
- **US-04** — As an SMM, I tap "Reject" and am required to write a note explaining what to fix.
- **US-05** — As an SMM, after I approve and send, the page state updates to "Sent to client" with the timestamp and the option to re-send if needed (existing share-link send route already supports resend).
- **US-06** — As an SMM on phone, the ApproveAndSendBar is pinned to the bottom and never obscured by post cards.

## In Scope

- New page: `app/admin/calendar/review/drop/[id]/page.tsx` (pre-approval state, no share-link token yet).
- New page: `app/admin/calendar/review/[token]/page.tsx` (post-approval state, share link minted).
- New component: `components/calendar/review/review-header.tsx` — client name, post count, date range, editor note, state pill.
- New component: `components/calendar/review/approve-and-send-bar.tsx` — pinned bottom bar with three CTAs.
- New component: `components/calendar/review/reject-dialog.tsx` — modal for the rejection note.
- New component: `components/calendar/review/edit-in-place-link.tsx` — wraps post cards with an "Edit" affordance.
- Reuse: existing share-link post list renderer (whatever component renders the post stack in the public share link view).

## Out of Scope

- Inline caption editing on the review page itself. Edit pushes into the existing per-post editor; no double UI.
- Bulk approve across multiple drops. One drop per review session.
- Threaded comments on the review page (the existing share-link comment system already covers per-post discussion; this PRD does not add a new thread layer for SMM-internal notes).
- A separate editor-facing rejection inbox. The editor sees rejection via the `smm_rejected` pill on the drop detail page (CUP-01).

## Resolved Decisions

- **D-01** — One page for both pre- and post-approval, or two? **→ Two routes that share a component shell.** Rationale: pre-approval reads the drop directly (no token, no share-link row); post-approval reads via the existing share-link route. Keeping them split lets each query stay simple. The shared shell is the rendering component, not the route.
- **D-02** — Approve and send as one button, or two steps? **→ One button labeled "Approve and send," with a confirmation dialog that previews the client email subject + recipients + a "Send" button.** Rationale: matches the user's mental model ("I'm done, send it") while still giving a final glance.
- **D-03** — Should reject be a full-screen modal or an inline form? **→ Modal (bottom sheet on mobile).** Rationale: a required field with a "Send rejection" button benefits from focus; inline tends to get accidentally pressed.
- **D-04** — Can the SMM edit captions inline on the review page? **→ No.** Rationale: the post editor exists; mirroring its logic on the review page is duplicate work and a future bug source. Edit jumps to the editor and returns.
- **D-05** — Where does the back-from-editor return path live? **→ A `?return=review` query param on the editor route.** Rationale: minimal coupling, easy to grep.
- **D-06** — Mobile-first or desktop-first? **→ Mobile-first.** Rationale: the user explicitly said they want to review on phone via Slack. The ApproveAndSendBar pins to the viewport bottom on mobile and to the top of the right-rail on desktop.

## Data Model

No schema changes. CUP-01 + CUP-02 added everything needed.

## API Contracts

This PRD does not add new HTTP routes. It calls CUP-01's routes:

- Approve + send → `POST /api/calendar/drops/[id]/handoff/approve` with `{ mintAndSend: true, clientMessage }`.
- Approve only (rare) → same route with `{ mintAndSend: false }`.
- Reject → `POST /api/calendar/drops/[id]/handoff/reject` with `{ note, targetState: 'editing' }`.
- Resend (when state is already `client_sent`) → existing `POST /api/calendar/share/[token]/send`.
- Per-post edit → existing post editor; the review page just deep-links.

## LLM Prompts

None.

## UI Components

### `components/calendar/review/review-header.tsx`
Purpose: top of the review page. Identity, state, summary.
Props:
```ts
type Props = {
  clientName: string;
  postCount: number;
  dateRange: { start: string; end: string };
  state: 'smm_review' | 'smm_approved' | 'client_sent';
  editorNote?: string;
  history: Array<{ state: string; at: string; actor: string; note?: string }>;
};
```
Layout: client name in `text-xl font-medium`, post count + date range as one line in `text-sm text-text-muted`, state pill on the right, editor note (if present) as a quoted block underneath. History collapses behind a "View history" disclosure.
Copy:
- Title: "{clientName}"
- Subline: "{postCount} posts, {date_range_short}"
- Pill (smm_review): "Awaiting your review"
- Pill (smm_approved): "Approved, ready to send"
- Pill (client_sent): "Sent to client • {timestamp}"
- Editor note quote: italicized, in `bg-surface-hover` block.
Tokens: `bg-surface`, `accent-text` for the action-required pill, neutral for sent.

### `components/calendar/review/approve-and-send-bar.tsx`
Purpose: pinned action bar. Mobile-first.
Props:
```ts
type Props = {
  dropId: string;
  state: 'smm_review' | 'smm_approved' | 'client_sent';
  canApprove: boolean; // false during in-flight request
  onApproveAndSend: (clientMessage?: string) => Promise<void>;
  onReject: () => void; // opens reject dialog
  onEditCalendar: () => void; // routes to /admin/calendar with drop selected
};
```
Layout:
- Mobile (< 768px): `fixed bottom-0 left-0 right-0` bar with three buttons: "Reject" (ghost, danger color), "Edit" (ghost), "Approve and send" (accent, takes 50% width). `safe-area-inset-bottom` padding.
- Desktop (≥ 768px): right-rail card, same three buttons stacked vertically.
- Disabled state when `canApprove === false` (in-flight) shows a spinner on the approve button.
- When state is `client_sent`: bar collapses to one neutral button "Resend to client" + a small "View share link" link.
Copy:
- "Approve and send"
- "Reject"
- "Edit calendar"
- "Resend to client"
States: idle, pending (spinner), error toast, success (page state refetches and bar re-renders).
Tokens: standard `<Button>` variants. No uppercase per feedback memory.

### `components/calendar/review/reject-dialog.tsx`
Purpose: collect the rejection note + fire the reject route.
Props:
```ts
type Props = {
  dropId: string;
  open: boolean;
  onClose: () => void;
  onRejected: () => void; // called after success; parent refetches
};
```
Layout: modal on desktop, bottom sheet on mobile. Title "Send back to editor." Textarea with min 1 char, max 2000. "Send" button is accent + disabled until note has content. Cancel button is ghost.
Copy:
- Title: "Send back to editor"
- Helper: "Explain what to fix. The editor will see this on their drop page."
- Send: "Send rejection"
- Cancel: "Cancel"
Tokens: standard modal pattern from `components/ui/dialog.tsx` (verify file).

### `components/calendar/review/post-list-with-edit.tsx`
Purpose: wraps the existing share-link post list, decorates each card with an "Edit" affordance that deep-links to the editor with `?return=review`.
Props: forwards everything the existing list takes, plus `editReturnUrl: string`.
Layout: no visual change to the post card; "Edit" sits in the card's top-right as a small chip on hover (desktop) or always (mobile).
Tokens: `text-text-muted hover:text-text-primary`.

## File Map

Create:
- `app/admin/calendar/review/drop/[id]/page.tsx` — server component, loads drop + posts.
- `app/admin/calendar/review/[token]/page.tsx` — server component, loads share-link + posts.
- `components/calendar/review/review-header.tsx`
- `components/calendar/review/approve-and-send-bar.tsx`
- `components/calendar/review/reject-dialog.tsx`
- `components/calendar/review/post-list-with-edit.tsx`

Modify:
- Existing post editor route (admin calendar drop editor) to honour `?return=review` and route back accordingly.
- The shared share-link post list component to accept an optional "edit slot" prop so CUP-03 can inject the edit chip without forking the component. (Verify the component's path during build; do not duplicate.)

## Env Vars

None new.

## Edge Cases

- **State changes underneath the page** (editor cancels handoff while SMM has the page open). The page refetches state on focus + on every action; if the state is no longer `smm_review`, the bar disables and shows a banner: "This drop is no longer awaiting review. Refresh to see the current state."
- **Network failure on approve.** Optimistic toast on press, real fetch in background. On 4xx/5xx, undo the optimistic state and show error toast with the server message.
- **Slack-deep-link to a drop that has already been sent** (SMM clicks an old Slack message). The page renders fine; the bar shows the resend variant. No 404, no confusing empty state.
- **Drop with no posts** (edge of CUP-01 but reachable if someone manually puts a drop into smm_review). Page renders the header + a "No posts on this drop yet" empty state and disables Approve.
- **Reject dialog open + parent state changes.** Dialog is controlled by `open` prop; if state drifts to a non-rejectable state, the modal closes on next render with a toast.

## Test Plan

- Unit: `approve-and-send-bar.test.tsx` — renders correct bar per state, click handlers fire, disabled while in flight, mobile vs desktop layout.
- Unit: `reject-dialog.test.tsx` — note required, send disabled until note has content, success closes dialog.
- Integration: end-to-end flow — open `/admin/calendar/review/drop/[id]` after a handoff, press Approve and send, expect state `client_sent`, page renders the resend bar.
- E2E (Playwright): the full chain: editor presses handoff → SMM opens review URL → SMM rejects with note → editor sees rejection pill → editor re-submits → SMM approves and sends → client receives email (verify against test recipient).
- Manual QA: review the page on a 375px viewport in dev, verify ApproveAndSendBar pinning + safe-area padding.

## Architecture Wiring

The review surface is a thin admin overlay on existing primitives. It reads from existing tables (`content_drops`, `scheduled_posts`, `content_drop_share_links`), calls CUP-01 routes for state transitions, and reuses the existing share-link rendering component for the post list. The only net-new UI is the action bar + reject dialog + header pill. No new tables, no new HTTP routes. The two route files (`/drop/[id]` and `/[token]`) share a content shell to avoid drift between pre- and post-approval views.

Mobile-first per D-06 because the user's stated workflow is "Slack ping on phone → tap → approve." The pinned bottom bar pattern matches existing mobile-optimised surfaces in the app (`docs/mobile-adaptation/` for reference).

## Done When

- Both review routes render correctly for their respective states.
- Approve and send fires the existing handoff/approve route with `mintAndSend: true` and the page transitions to `client_sent` on success.
- Reject opens the dialog, requires a note, fires the reject route, page transitions to `editing` and bar disables.
- Edit chip on each post card routes to the existing editor with `?return=review`; save returns to the review page.
- Mobile viewport: 375px works; bottom bar is pinned and not obscured.
- Slack message from CUP-02 deep-links to the correct review URL based on drop state.
- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- No em dash in any new copy.
