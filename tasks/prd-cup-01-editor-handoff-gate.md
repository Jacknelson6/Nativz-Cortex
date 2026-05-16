# PRD: CUP · 01 · Editor handoff gate

> CUP / 01 · drafted 2026-05-16

## Purpose & Value

Today an editor's workflow ends with "I uploaded everything." There is no explicit "I'm done, hand this to the SMM" signal. The drop sits in `content_drops.status = 'ready'` and Jack has to remember which clients have new drops waiting. This PRD adds an explicit handoff state machine so the editor's role ends at one button press and the SMM's role starts on a notification.

The state machine also enforces "unapproved drops never go to clients": the existing send route gets a precondition that blocks send unless the drop is in `smm_approved`.

## Problem

- Editors finish a drop and there is no clear "I'm done" action. They either nudge Jack on Slack or hope he notices.
- The mint + send routes are separate, but nothing prevents send from firing before SMM has reviewed. The only thing standing between an unreviewed drop and the client's inbox is the SMM remembering not to press send.
- There is no machine-readable concept of "this drop is awaiting SMM review" vs "this drop is approved and ready to send to client." Notifications (CUP-02) need this signal.

## Primary User

Editor finishing a monthly cut for a client. Their job is video; the calendar UI is a side surface they touch maybe twice a month.

## SMART Goals

- 100% of drops created after this ships move through `smm_review` before any `share/send` call succeeds.
- Editor handoff is a single click from the drop detail page. No multi-step modal.
- Send route returns 409 with a clear error message if called before `smm_approved`.
- State transitions are append-only logged in `content_drops.handoff_history` (jsonb), so we can audit "who approved when" later.
- Legacy drops (created before migration) default to `smm_approved` so the send route does not break for in-flight work.

## User Stories

- **US-01** — As an editor, I can press "Hand off to SMM" on a ready drop so that I know my role is done.
- **US-02** — As an editor, I see a clear pending state ("Waiting on SMM review") after handoff so I don't re-press.
- **US-03** — As an SMM, I can see in the admin calendar list which drops are awaiting my review (badge / filter).
- **US-04** — As an SMM, attempting to send a drop that is not in `smm_approved` returns a clear error explaining what to do.
- **US-05** — As a developer maintaining a legacy script that hits `/share/send`, I get a useful 409 with the state name, not a silent no-op.

## In Scope

- Migration 319: `content_drops.handoff_state` enum, `content_drops.handoff_history` jsonb default `'[]'::jsonb`, partial index on `handoff_state` for the SMM filter.
- New route: `POST /api/calendar/drops/[id]/handoff` (editor presses "Hand off").
- New route: `POST /api/calendar/drops/[id]/handoff/approve` (SMM presses approve in CUP-03; lives here because it is a state transition, not a UI artifact).
- New route: `POST /api/calendar/drops/[id]/handoff/reject` (SMM rejects with note in CUP-03).
- Send-route guard inside `app/api/calendar/share/[token]/send/route.ts`: read drop's handoff_state, refuse if not approved.
- Editor-facing button + state pill on the drop detail page in `app/admin/calendar/drops/[id]/page.tsx` (or whichever file owns the drop detail today; confirm during build).
- Admin calendar list filter pill: "Awaiting SMM review."

## Out of Scope

- The notification dispatch itself — that is CUP-02.
- The review page UI — that is CUP-03.
- Edit-in-place flow — that reuses existing drop editor.
- Multi-step approval (e.g. SMM + creative director). Single approver for now.

## Resolved Decisions

- **D-01** — Where does state live? **→ On `content_drops` (not on the share link).** Rationale: the share link's lifecycle is downstream; the editor → SMM handoff is about the drop itself. The share link gets minted as part of approve, not as part of handoff.
- **D-02** — Do we mint the share link at handoff time or at approve time? **→ At approve time.** Rationale: the share link triggers `cancelOrphanPostsInZernio()` and is meant to be the client-facing artifact. Until SMM has approved, there is no commitment to the schedule and no need for a stable token. CUP-03 mints + sends in one action.
- **D-03** — What about preview? Doesn't the SMM need to see the share link content before approving? **→ A preview render reuses the share link view component but reads directly from the drop + scheduled_posts, bypassing the `content_drop_share_links` row.** Rationale: keeps approve idempotent and avoids minting tokens that may never get sent.
- **D-04** — Legacy drops in flight? **→ Backfill to `smm_approved`.** Rationale: the gate is forward-looking. Don't break currently-scheduled work.
- **D-05** — Can the editor un-press handoff? **→ Yes, while in `smm_review`.** Once SMM has approved or rejected, the editor must wait for the SMM action. Reduces "accidental press" anxiety.
- **D-06** — Can the SMM bounce an approved drop back to review? **→ Yes via reject, which moves state back to `editing`.** Rationale: SMM may notice an issue post-approval; reject is the clean undo path. Send route will fail again until re-approved.
- **D-07** — What states exactly? **→ `editing`, `smm_review`, `smm_approved`, `smm_rejected`, `client_sent`.** `client_sent` is set automatically when the send route succeeds. `smm_rejected` is terminal-ish but the editor can press handoff again to move back to `smm_review` after fixing.

## Data Model

### Migration 319_drop_handoff_state.sql

```sql
-- State machine for editor → SMM handoff. See PRD CUP-01.

CREATE TYPE drop_handoff_state AS ENUM (
  'editing',
  'smm_review',
  'smm_approved',
  'smm_rejected',
  'client_sent'
);

ALTER TABLE content_drops
  ADD COLUMN handoff_state drop_handoff_state NOT NULL DEFAULT 'editing',
  ADD COLUMN handoff_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: any drop that already has an active share link is treated as if
-- it was approved by the SMM (because today's flow is: SMM mints + sends
-- manually, so reaching that point implies approval). Drops without a share
-- link stay in 'editing'.
UPDATE content_drops cd
SET handoff_state = 'client_sent',
    handoff_history = jsonb_build_array(jsonb_build_object(
      'state', 'client_sent',
      'at', NOW(),
      'actor', 'system-backfill',
      'note', 'migration 319 backfill - pre-existing share link'
    ))
WHERE EXISTS (
  SELECT 1 FROM content_drop_share_links sl
  WHERE sl.drop_id = cd.id AND sl.first_sent_at IS NOT NULL
);

UPDATE content_drops cd
SET handoff_state = 'smm_approved',
    handoff_history = jsonb_build_array(jsonb_build_object(
      'state', 'smm_approved',
      'at', NOW(),
      'actor', 'system-backfill',
      'note', 'migration 319 backfill - minted but unsent share link'
    ))
WHERE handoff_state = 'editing'
  AND EXISTS (
    SELECT 1 FROM content_drop_share_links sl
    WHERE sl.drop_id = cd.id AND sl.first_sent_at IS NULL
  );

-- Partial index for the "awaiting SMM" admin filter. Hot path.
CREATE INDEX content_drops_smm_review_idx
  ON content_drops (handoff_state, updated_at DESC)
  WHERE handoff_state = 'smm_review';
```

`handoff_history` row shape (validated in the lib, not in Postgres):

```ts
type HandoffHistoryEntry = {
  state: 'editing' | 'smm_review' | 'smm_approved' | 'smm_rejected' | 'client_sent';
  at: string; // ISO
  actor: string; // user id, or 'system-*'
  note?: string; // editor or SMM message
};
```

## API Contracts

### POST /api/calendar/drops/[id]/handoff
Auth: admin (editor role is part of admin per current schema; gate by `users.role IN ('admin', 'super_admin')` and the user being on the editing project / drop).
Request:
```ts
const RequestSchema = z.object({
  note: z.string().max(500).optional(),
});
```
Response (200):
```ts
{
  drop: { id: string; handoff_state: 'smm_review' };
  history: HandoffHistoryEntry[];
}
```
Errors: 400 invalid input, 401 unauthorized, 403 not on this drop, 404 drop not found, 409 invalid transition (e.g. drop is already in `client_sent`), 500 server.

Transition rules:
- `editing → smm_review`: OK
- `smm_rejected → smm_review`: OK (editor re-submits after fixes)
- Anything else: 409 with current state in the response body.

### POST /api/calendar/drops/[id]/handoff/approve
Auth: admin with `permissions.calendar.approve` (super_admin always; check existing permissions table).
Request:
```ts
const RequestSchema = z.object({
  note: z.string().max(500).optional(),
  // Optional: also mint + send the share link in the same call.
  // When false (default), this only flips state. CUP-03's "approve and send"
  // button calls this with true, which is a convenience for the common path.
  mintAndSend: z.boolean().default(false),
  // Only honoured when mintAndSend=true.
  clientMessage: z.string().max(2000).optional(),
});
```
Response (200):
```ts
{
  drop: { id: string; handoff_state: 'smm_approved' | 'client_sent' };
  shareLink?: { token: string; expires_at: string };
}
```
Errors: 400, 401, 403, 404, 409 (state must be `smm_review`), 500.

Transition rules:
- `smm_review → smm_approved`: OK (always).
- With `mintAndSend=true`: after the state flip, the route internally calls `mintOrRefreshShareLink()` + the send routine, then sets state to `client_sent` in the same transaction.

### POST /api/calendar/drops/[id]/handoff/reject
Auth: admin with `permissions.calendar.approve`.
Request:
```ts
const RequestSchema = z.object({
  note: z.string().min(1).max(2000), // required — explain what to fix
  targetState: z.enum(['editing', 'smm_rejected']).default('smm_rejected'),
});
```
Response (200):
```ts
{
  drop: { id: string; handoff_state: 'editing' | 'smm_rejected' };
}
```
Errors: 400, 401, 403, 404, 409 (state must be `smm_review` or `smm_approved`), 500.

Transition rules:
- `smm_review → smm_rejected | editing`: OK.
- `smm_approved → smm_rejected | editing`: OK (un-approve before send).
- `client_sent → *`: 409. Send is the point of no return; recovery is a manual "create a new drop."

### Guard on existing route: POST /api/calendar/share/[token]/send

Precondition added at the top of the existing handler:

```ts
const { data: drop } = await admin
  .from('content_drops')
  .select('id, handoff_state')
  .eq('id', shareLink.drop_id)
  .single();
if (!drop || (drop.handoff_state !== 'smm_approved' && drop.handoff_state !== 'client_sent')) {
  return NextResponse.json(
    {
      error: 'drop not approved for client send',
      handoff_state: drop?.handoff_state ?? 'unknown',
      hint: 'press Approve in the SMM review page first',
    },
    { status: 409 },
  );
}
```

After the send succeeds, append to `handoff_history` and set `handoff_state = 'client_sent'` (idempotent if already there).

## UI Components

### `components/calendar/editor-handoff-button.tsx`
Purpose: editor's "I'm done" CTA + state pill on the drop detail page.
Props:
```ts
type Props = {
  dropId: string;
  state: 'editing' | 'smm_review' | 'smm_approved' | 'smm_rejected' | 'client_sent';
  rejectionNote?: string; // shown inline when state is smm_rejected
};
```
Layout: right-aligned in the drop detail header. When `editing`, big accent button "Hand off to SMM." When `smm_review`, muted pill "Waiting on SMM review" + small "cancel handoff" link. When `smm_rejected`, red-tinted card with the note + "Re-submit" button. When `smm_approved` or `client_sent`, neutral pill.
Copy:
- CTA (editing): "Hand off to SMM"
- Pill (smm_review): "Waiting on SMM review"
- Pill (smm_approved): "Approved by SMM"
- Pill (client_sent): "Sent to client"
- Card title (smm_rejected): "SMM requested changes"
- CTA (smm_rejected): "Re-submit for review"
States: idle, optimistic-pending (after press, before refetch), error toast on 409 / network fail.
Tokens: `bg-surface`, `accent-text`, `border-nativz-border`.

### `components/calendar/drop-list-smm-filter.tsx`
Purpose: filter pill in the admin calendar list ("All / Awaiting SMM / Approved / Sent").
Layout: pill row, accent state for selected. Mobile-friendly horizontal scroll.
Tokens: standard pill pattern from `components/ui/filter-pill.tsx` (verify file name during build; reuse, do not invent).

## File Map

Create:
- `supabase/migrations/319_drop_handoff_state.sql` - state machine + backfill.
- `app/api/calendar/drops/[id]/handoff/route.ts` — POST handoff (editor).
- `app/api/calendar/drops/[id]/handoff/approve/route.ts` — POST approve (SMM).
- `app/api/calendar/drops/[id]/handoff/reject/route.ts` — POST reject (SMM).
- `lib/calendar/handoff-state.ts` — state machine helpers (`canTransition`, `appendHistory`, type exports).
- `lib/calendar/handoff-state.test.ts` — unit tests for transitions.
- `components/calendar/editor-handoff-button.tsx` — editor CTA + state pills.
- `components/calendar/drop-list-smm-filter.tsx` — admin filter pill.

Modify:
- `app/api/calendar/share/[token]/send/route.ts` — add the precondition guard + write `client_sent` on success.
- `app/admin/calendar/drops/[id]/page.tsx` (or current equivalent) — render `<EditorHandoffButton />` in the header.
- `app/admin/calendar/page.tsx` — render `<DropListSmmFilter />` and respect its value in the drop query.
- `lib/calendar/share-link.ts` — `mintOrRefreshShareLink` becomes callable by `handoff/approve` route (export if not already).

## Env Vars

None new.

## Edge Cases

- **Editor presses handoff twice.** Second call is a 409 ("already in smm_review"). Client-side button optimistically updates, so the second call only happens on race; surface the error as a quiet toast.
- **SMM approves and presses the button while editor un-handoffs.** Last write wins at the state machine level; the cancellation will get a 409 because state is now `smm_approved`. Editor sees "this drop has been approved" toast and the cancel button disappears.
- **Drop with no scheduled posts yet.** Handoff should refuse: cannot review nothing. 409 with `hint: 'no scheduled posts on this drop'`.
- **All posts in the drop are already `published`.** Handoff refuses with the same 409; this drop is done.
- **Legacy `/share/send` cron / script that does not know about the gate.** Backfill in migration 273 puts in-flight drops in `client_sent` or `smm_approved`, so the cron continues to work on existing data. New drops written after the migration will go through the state machine.
- **Bulk re-publish from the admin scheduler.** Out of scope; the scheduler route does not use share/send, so it is unaffected.

## Test Plan

- Unit: `lib/calendar/handoff-state.test.ts` — every legal and illegal transition, history append shape, idempotent `client_sent` set.
- Unit: `app/api/calendar/drops/[id]/handoff/route.test.ts` — auth (admin only), 404, 409 on bad state, history append.
- Unit: `app/api/calendar/share/[token]/send/route.test.ts` — the new 409 path + the post-send `client_sent` write.
- E2E (Playwright): editor presses handoff → state pill flips → admin presses approve → share link mints → admin presses send → state is `client_sent`. Then reject path: SMM rejects → state is `smm_rejected` → editor sees note → editor re-submits → state is `smm_review` again.
- Manual QA: legacy drop (one that was sent before the migration) loads in the admin calendar with the "Sent" pill and does not show approve/handoff CTAs. The send route still works for it (no-op on state).

## Architecture Wiring

The handoff state lives on `content_drops` because the editor's contract is "I am done with this drop," not "I am done with this share link." The share link is a downstream artifact minted at approve time (D-02). The send route's precondition is the single enforcement point preventing accidental client emails; this matches the existing pattern of doing auth + invariant checks at the top of API handlers (per `.claude/rules/api-routes.md`).

`handoff_history` is jsonb rather than a separate audit table because the row count is bounded (5-10 transitions per drop, ever) and we never query history across drops. If that changes later we promote to `drop_handoff_events`.

## Done When

- Migration 319 applied; `content_drops.handoff_state` exists; backfill correct.
- Editor handoff button renders on the drop detail page and works end to end.
- SMM filter pill works in the admin calendar list.
- Send route refuses to send when state is not `smm_approved` or `client_sent`.
- All unit + e2e tests in the test plan pass.
- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- No em dash in any new copy.
