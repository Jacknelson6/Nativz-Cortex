# PRD 01: Comment types and rename to comments

## Problem

`post_review_comments.status` and `editing_project_review_comments.status` overload one column with two ideas: what the author meant (revision vs reaction) and what lifecycle event happened (approval, video revised). The UI calls all of it "request changes," which is wrong for half the rows in the table today. Clients leave reactions, questions, and notes in the same thread as actual change requests, and revisions get lost in the noise.

## Goal

Cleanly separate three concepts on every comment row:

1. `kind`: what the author intended (revision, feedback, admin_response, approval, video_revised).
2. `resolved_at`: whether a revision is still open.
3. UI affordance: revisions look different from reactions, admin responses look different from both.

Result: a thread that reads like a normal product comment thread, with revisions clearly tracked.

## Scope

Both share comment tables and both share pages. No admin dashboard changes in this PRD beyond surfacing the new kind in lists that already show comments.

## Spec

### Schema

Migration adds to both `post_review_comments` and `editing_project_review_comments`:

```sql
alter table post_review_comments
  add column kind text not null default 'feedback'
  check (kind in ('revision', 'feedback', 'admin_response', 'approval', 'video_revised'));
```

Repeat for `editing_project_review_comments`.

Backfill in the same migration:

- `status = 'changes_requested'` → `kind = 'revision'`
- `status = 'comment'` → `kind = 'feedback'`
- `status = 'approved'` → `kind = 'approval'`
- `status = 'video_revised'` → `kind = 'video_revised'`

Leave the legacy `status` column in place during PRD 01 to 08 so v1 paths keep working. PRD 09 drops it.

Index: `create index on post_review_comments (review_link_id, kind, resolved_at)` to make the unresolved-revisions query fast. Same on the editing table.

### UI

Composer rename:

- Replace every "request changes" label, button, helper text, and tooltip with "add comment."
- Default kind in the composer is `feedback`.
- A single toggle or chip in the composer reads "mark as revision." Flipping it sets `kind = 'revision'` on submit. Off means `feedback`.
- For authenticated admins (per PRD 05), the toggle is disabled and replaced by a static "admin response" chip. Submitting forces `kind = 'admin_response'`.

Thread rendering:

- Revision: red accent left border, "revision" chip, shows resolve/unresolve control.
- Feedback: neutral surface, "comment" chip, no resolve control.
- Admin response: agency accent color, "team" chip, no resolve control.
- Approval and video_revised render as inline event lines, not full comment cards.

Counters:

- Replace any "N changes requested" pill with "N revisions" sourced from `count(kind = 'revision' and resolved_at is null)`.

### API

`POST /api/calendar/share/[token]/comment` and `POST /api/editing/share/[token]/comment`:

- Accept `kind` in the body. Reject if not in the enum.
- If author is admin (per PRD 05), force `kind = 'admin_response'` regardless of input.
- If `kind = 'revision'`, also clear nothing; resolution happens on PATCH or via "mark revised" in PRD 06.

`PATCH /api/calendar/share/[token]/comment` and editing equivalent:

- Add `{ resolved: boolean }` handler that toggles `resolved_at`.

## Acceptance

- Migration runs clean on staging and backfills every row.
- Both share pages render the three visual treatments correctly.
- Composer defaults to feedback; revision toggle works; admin composer forces admin response.
- Unresolved revisions counter is correct for legacy rows after backfill.
- Existing daily digest and Google Chat hooks still fire (this PRD does not touch notifications).

## Out of scope

- Changing how admins resolve revisions (covered in PRD 06).
- Renaming the underlying tables.
- Removing the legacy `status` column.

## Dependencies

None. PRD 01 ships first.
