# PRD 06: Admin operator controls on share pages

## Problem

Strategists already bounce between admin dashboard and share link to action a review pass. A comment lands, they read it on the share page, they swap to `/admin/calendar` or the editing project page, replace the file, mark revised, swap back to confirm. We can collapse this into one surface. The actions exist server-side; we just need to expose them on the share page when the viewer is an authenticated admin in the right agency.

## Goal

Authenticated admins on a share page (calendar or editing) see operator controls inline on every tile (post or video). Five capabilities, in parity across the two surfaces where applicable.

## Scope

Both share pages. Reuses existing admin endpoints under the hood; wraps them in share-scoped variants that re-check admin + agency before delegating.

## Spec

### Capabilities

1. **Replace content**
   - Calendar: replace the media for a scheduled post. Reuses `POST /api/calendar/share/[token]/replace-image/[postId]`, already admin-gated but expand its auth to accept any agency admin on this share link.
   - Editing: replace the cut for a video in the project. New share-scoped endpoint `PATCH /api/editing/share/[token]/video/[videoId]/replace` that delegates to the existing admin path after auth.
2. **Change cover photo** (calendar only, since editing has no cover concept)
   - Reuses `POST /api/calendar/share/[token]/cover/[postId]`.
3. **Delete post or video**
   - Calendar: `DELETE /api/calendar/share/[token]/post/[postId]`, soft delete via `archived_at`. Removes from the share link's visible set; does not remove from the underlying drop.
   - Editing: `DELETE /api/editing/share/[token]/video/[videoId]`, soft delete via `archived_at`. Same semantics.
   - Confirmation modal required: "this hides it from the client. Continue?"
   - Hard rule: if the post is unapproved and has a scheduled publish time in the future, deletion also clears the schedule so it cannot auto-publish. This is the standing "unapproved drop posts must never publish" invariant.
4. **Mark as revised (per-revision)**
   - Each open revision comment gets its own "mark revised" button. There is no bulk "everything revised" button on a post or video.
   - Clicking it opens a small inline composer with an optional note ("what changed?"). The admin can submit with or without a note.
   - On submit:
     - Insert a reply row with `kind = 'video_revised'`, `parent_comment_id = <the revision being closed>`, and the note as the body. Empty note still creates the reply row so the audit trail is consistent.
     - Set `resolved_at = now()` on the targeted revision comment only.
     - Fire the "marked revised" notification per PRD 08 with the revision id and note in the payload.
   - Convenience: if a post or video has 2+ open revisions, show a small "mark all revised" link that opens one note composer and applies the same note across every open revision on that item. Each row still gets its own video_revised reply.
5. **Post admin response comment**
   - The same composer with admin chip forced. Submitting writes `kind = 'admin_response'`. Replies live in the same thread as the revision they answer.

### UI surfaces

Per post tile (calendar) or per video card (editing), admins see a small kebab menu with: replace content, change cover (calendar), delete, mark revised. The composer is always visible to admins like it is to everyone else, but the kind toggle is locked.

A subtle "admin mode" indicator at the top of the page reminds the operator they're seeing more than a client would. Toggle "view as client" hides admin chrome temporarily without logging them out, so they can sanity-check the surface.

### Visibility rules

- Admin controls render only when `author_role = 'admin'` resolves server-side. Never client-only.
- "View as client" toggle does not change server permissions, only the rendered surface.
- Non-admin sees zero admin controls and zero hint that they exist.

### Audit trail

New table:

```sql
create table share_link_admin_actions (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null,
  share_link_kind text not null check (share_link_kind in ('calendar', 'editing')),
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  target_kind text,
  target_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);
```

Actions to log:

- `content.replace`
- `cover.change`
- `post.delete` / `video.delete`
- `revision.mark_revised`
- `comment.admin_response.create`
- `auth.login` (success) and `auth.login.failed`

### Server enforcement

Every admin endpoint above must:

1. Resolve the Supabase session.
2. Resolve the share link, its client, and its agency.
3. Verify the user is admin or super_admin in that agency.
4. Reject anything else with 403. Do not silently fall through to a viewer path.

## Acceptance

- Logged-in admin sees the kebab on each tile; logged-in viewer and guest do not.
- Replace content (both surfaces) works end to end and triggers the right notification.
- Delete soft-archives and clears any pending publish for unapproved posts.
- Mark revised closes all open revisions on the targeted item and posts a video_revised event in the thread.
- "View as client" toggle hides admin chrome without affecting server permissions.
- Every admin action writes a `share_link_admin_actions` row.
- Wrong-agency admin (e.g. an internal Cortex super admin who is not in this client's agency) is rejected at the API.

## Out of scope

- Bulk admin actions across many tiles.
- Re-ordering posts on the share page.
- New cover types or media types.

## Dependencies

PRD 05 (identity model). PRD 01 (comment kinds). PRD 04 (modal login provides the admin session in the first place).
