# PRD 08: Notification matrix and dispatcher

## Problem

Today notification logic for share comments is split across the calendar comment route, the editing comment route, a separate notify-revisions route, and a daily digest cron. Each path makes its own decision about who to email or chat. The new comment kinds and the new admin response path will make this worse if we just bolt on. We need one dispatcher and one matrix.

## Goal

A single function `notifyShareEvent({ event, actor, shareLink, target, payload })` that decides who to notify on which channel, based on a documented matrix. All comment, revision, approval, and admin-action paths call it. No path emits notifications directly anymore.

## Scope

Both share surfaces. Existing Google Chat realtime webhook stays. Existing daily digest cron stays as the email aggregator.

## Spec

### Events

| Event | Actor | Description |
|---|---|---|
| `comment.created.revision` | viewer or guest | A revision comment was added |
| `comment.created.feedback` | viewer or guest | A feedback comment was added |
| `comment.created.admin_response` | admin | An admin response was posted |
| `comment.resolved` | admin | A revision was marked resolved |
| `event.approved` | viewer or guest | An item was approved |
| `event.marked_revised` | admin | An admin marked an item revised |
| `admin.content_replaced` | admin | Admin replaced content on the share page |
| `admin.cover_changed` | admin | Admin changed a cover |
| `admin.deleted` | admin | Admin deleted a post or video |

### Routing matrix

| Event | Notifies | Channel | Aggregated |
|---|---|---|---|
| `comment.created.revision` | strategist on the client + agency admins assigned | Google Chat realtime + daily digest | yes |
| `comment.created.feedback` | strategist on the client | daily digest only | yes |
| `comment.created.admin_response` | original commenter | dashboard inbox immediately + rolled into `event.marked_revised` email when the revision closes; no standalone email | yes |
| `comment.resolved` | original commenter | dashboard inbox immediately; folded into the revised-rollup email | yes |
| `event.approved` | strategist + agency admins | Google Chat realtime | no |
| `event.marked_revised` | original commenter (if viewer with email) + client primary contact | one rollup email per revision containing the note and any admin replies posted in this revision's thread since it opened | no |
| `admin.content_replaced` | other admins on the project | Google Chat | yes |
| `admin.cover_changed` | other admins on the project | Google Chat | yes |
| `admin.deleted` | other admins on the project | Google Chat | yes |

Guests are never directly notified. They get email only by virtue of someone forwarding the share link.

### Why this shape (open for review at end of build)

We considered four shapes for client-facing email:

- **A. Daily digest only.** One email a day, no realtime. Lowest spam risk, slowest feedback.
- **B. Rollup at mark-revised.** Email only fires when the admin marks a revision revised. Ties the email to a concrete client-relevant action.
- **C. Threshold throttle.** Immediate on first reply within a window, bundled after. Most chat-like; most code.
- **D. In-app only.** Dashboard notifications, no email at all.

Shipping **B + a minimal dashboard inbox**. Admin chat replies do not email the client one-by-one; they accumulate against the open revision and are emailed together when the admin marks it revised, alongside the admin's note. This avoids the multi-email-per-thread case while still keeping clients informed at the moment they need to know. A logged-in viewer also sees the replies appear in their dashboard inbox in real time so they're not waiting on email for back-and-forth. Re-evaluate after pilot. If clients ask for real-time email, switch to C.

### Dashboard inbox (portal-side)

Minimal addition to the existing portal:

- New table `portal_notifications` keyed by `user_id`, with columns `id`, `kind`, `share_link_id`, `target_id`, `body`, `seen_at`, `created_at`.
- Dispatcher writes one row per logged-in viewer recipient for `comment.created.admin_response`, `comment.resolved`, and `event.marked_revised`.
- Portal navbar shows an unread count badge; clicking opens a panel listing the last 30 items with deep links into the relevant share page.
- No real-time websocket required; portal polls on focus.

### Dispatcher

Location: `lib/share/notify.ts`.

Signature:

```ts
export async function notifyShareEvent(input: {
  event: ShareEvent;
  actor: { role: 'admin' | 'viewer' | 'guest'; userId: string | null; displayName: string };
  shareLink: { kind: 'calendar' | 'editing'; id: string; token: string; clientId: string; organizationId: string; agency: string };
  target: { kind: 'post' | 'video' | 'comment' | 'project'; id: string };
  payload?: Record<string, unknown>;
}): Promise<void>;
```

Implementation:

1. Look up the matrix entry for `event`.
2. Resolve recipient sets (strategist, agency admins, original commenter, primary contact).
3. For realtime channels, post immediately.
4. For aggregated digest channels, insert a row into a new `share_link_notification_queue` table consumed by the existing daily digest cron.
5. Idempotency key prevents the same event firing twice if a route retries.

### Digest cron changes

The existing `app/api/cron/calendar-comment-digest/route.ts` reads from `share_link_notification_queue` instead of querying the comment tables directly. Same delivery schedule, same recipients, but the data source is the dispatcher's queue.

Editing comments now flow through the same cron rather than a parallel path.

### Migration to existing call sites

Replace direct webhook and email calls in:

- `app/api/calendar/share/[token]/comment/route.ts`
- `app/api/editing/share/[token]/comment/route.ts`
- `app/api/calendar/share/[token]/notify-revisions/route.ts`
- All admin endpoints introduced by PRD 06

with `notifyShareEvent` calls. Delete the bespoke webhook logic from each route after parity is confirmed in QA.

## Acceptance

- Every event listed fires through the dispatcher.
- Daily digest contents match the previous cron's output for the same input set (regression test on a snapshot).
- Guests are never directly notified.
- Idempotency holds (replaying a webhook does not double-fire).
- Admin actions on the share page appear in the daily digest for other admins.

## Out of scope

- Slack delivery (we use Google Chat).
- SMS.
- Push notifications to the mobile app (none exists).
- Per-user opt-out preferences on event types.

## Dependencies

PRD 01, PRD 05, PRD 06.
