# PRD Batch: Calendar Upload Polish (CUP), 2026-05-16

> 3 PRDs covering the editor handoff → SMM review → client send flow. Drafted as one batch for a Ralph loop build.

## Why this batch exists

Today the calendar upload pipeline is built but the human contract is loose. Editors upload finished short-form videos, AI generates captions, posts get scheduled, and a client share link gets minted. The problem: editors are not social media managers. The captions, scheduling cadence, and platform mix often need a second pass by someone whose job it is to look at this from the client's POV before it lands in front of the client.

The current `/api/calendar/share/[token]/send` route is admin-gated, so technically nothing publishes to the client without a human pressing send. But there is no "ready for your review" signal back to Jack, no purpose-built review surface separate from the client-facing share link, and no enforced state machine that prevents accidental mid-pipeline sends.

These three PRDs add the missing review loop:

1. **CUP-01 · Editor handoff gate** — explicit "editor done" action, drop-level handoff state machine, share link minted in `pending_smm_review` state so it cannot be sent to the client until approved.
2. **CUP-02 · Ops notifications + preview link** — fires a notification (in-app + optional Slack webhook + optional email) to the ops channel / SMM the moment a drop hits `pending_smm_review`. Includes preview link, client name, scheduled date range, post count, and inline approve / edit / reject CTAs.
3. **CUP-03 · SMM review surface** — new admin-only `/admin/calendar/review/[token]` page that renders the share-link contents with admin overlay: approve and send, edit-in-place, request changes from editor, reject.

## Primary users

- **Editor** — finishes their monthly cut, uploads, presses "I'm done." Should never have to think about social strategy.
- **SMM / content officer (Jack today)** — gets pinged the moment a drop is ready, reviews on phone or laptop, approves with one tap or jumps into the edit surface.
- **Client** — only sees the share link AFTER SMM approval. Their experience does not change.

## SMART batch goals

- Zero drops are sent to clients without explicit SMM approval (enforced at the share-link send route).
- SMM gets a notification within 30 seconds of editor pressing "I'm done."
- SMM can approve-and-send from the notification → review page in under 60 seconds for a clean drop.
- Edit-in-place from the review page reuses the existing drop calendar editor (no duplicate UI).
- No regression to the current send flow for legacy drops (drops that pre-date this state machine still work).

## File map

- `prd-cup-01-editor-handoff-gate.md` — state machine, "I'm done" button, `/api/calendar/drops/[id]/handoff` route, send-route guard.
- `prd-cup-02-ops-notifications.md` — `notifySmmReviewReady()` lib + Slack webhook + in-app notification type + dedup.
- `prd-cup-03-smm-review-surface.md` — `/admin/calendar/review/[token]` page, ApproveAndSendBar, EditInPlace handoff, RejectDialog.

## Cross-PRD wiring

- **CUP-01 → CUP-02.** The handoff route transition is the single fire-point for the notification. CUP-02 ships the dispatcher; CUP-01 calls it.
- **CUP-01 → CUP-03.** The state machine is the source of truth for what review actions are available. CUP-03 reads `content_drops.handoff_state` to render the right CTAs.
- **CUP-02 → CUP-03.** Slack message and in-app notification link to the CUP-03 review page, not the client share link.
- **CUP-03 → existing send route.** Approve + send still hits `/api/calendar/share/[token]/send`, but CUP-01 adds a precondition: 409 unless `handoff_state = 'smm_approved'`.

## Suggested build sequence

Phase by phase. Each phase ends ship-ready.

**Phase A · State machine + guard**
- CUP-01 migration (add `handoff_state`, `handoff_history`, indexes).
- CUP-01 handoff route + send-route precondition.

**Phase B · Notification dispatch**
- CUP-02 `notifySmmReviewReady()` lib + reuse of `lib/notifications.ts` + Slack webhook env vars.
- CUP-02 wires CUP-01's handoff route to fire the notification.

**Phase C · Review surface**
- CUP-03 review page, ApproveAndSendBar, RejectDialog.
- CUP-03 deep links from Slack message + in-app notification.

## Out of scope (across the batch)

- Multi-reviewer approval (1 SMM today, multi-tenant ops later).
- Editor-side rejection UI (editor sees rejection as a comment on the drop, not a dedicated UI).
- Auto-fixing flagged issues (Nerd suggests but SMM still presses approve).
- Mobile-native review UX (the page is mobile-responsive but is not a PWA).

## Hard rules carried into this batch

- No em dash. No en dash.
- No autonomous email send. The SMM approve action drafts then sends; never auto-fires.
- Unapproved drop posts must never publish. The send route precondition is the enforcement point.
- Drops vs posts: "posts" in any user-facing copy, "drops" only in internal jargon.
- Buttons never wrap. Sentence case. `accent-text` for primary CTAs.
