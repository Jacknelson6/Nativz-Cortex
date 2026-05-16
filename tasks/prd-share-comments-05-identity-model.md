# PRD 05: Author identity model on comments

## Problem

Today comment rows store an `author_name` string and an optional `author_user_id`. There's no canonical signal for "this comment was posted by an admin," and the client cannot trust whatever it sends as the author role. We need a server-enforced role field so admin response comments, viewer comments, and guest comments are always distinguishable, even in queries that run far from request context (digest crons, audit pulls).

## Goal

Add `author_role` to both comment tables, populate it on every write from the server's view of the requester, and use it consistently in UI rendering, notification routing, and admin counters.

## Scope

Both `post_review_comments` and `editing_project_review_comments`. The two comment POST endpoints. The thread component (PRD 07).

## Spec

### Schema

```sql
alter table post_review_comments
  add column author_role text not null default 'guest'
  check (author_role in ('admin', 'viewer', 'guest'));
```

Repeat for `editing_project_review_comments`.

Backfill:

- Rows with `author_user_id` not null and that user is `admin` or `super_admin` → `author_role = 'admin'`.
- Rows with `author_user_id` not null and that user is `viewer` → `author_role = 'viewer'`.
- Rows with `author_user_id` null → `author_role = 'guest'`.

Index: `create index on post_review_comments (review_link_id, author_role)` for cheap admin-vs-client splits. Same on editing table.

### Server rules

In `POST /api/calendar/share/[token]/comment` and editing equivalent:

1. Resolve the authenticated user from Supabase session, if any.
2. Resolve the share link's agency and organization.
3. Determine `author_role`:
   - Session present, user is admin or super_admin, agency matches → `admin`.
   - Session present, user is viewer, organization matches → `viewer`.
   - Session absent or agency mismatch → `guest`. Body must include `author_name`.
4. Write the comment with the resolved role. Ignore any role the client sent.
5. For `admin`, also force `kind = 'admin_response'` (from PRD 01) unless the action is an approval or revised marker (PRD 06).

### Cross-checks

- Guest write with empty `author_name` → 400.
- Viewer write whose `organization_id` does not match → 403, and surface a clear message in the UI prompting them to log in to the correct account.
- Admin write whose agency does not match → 403.

### UI chips

Three chip variants on each comment card:

- `admin`: agency accent background, "team" label, shows the admin's avatar and display name.
- `viewer`: cool neutral, "client" label, viewer's display name.
- `guest`: warmest neutral, "guest" label, captured display name.

Chips are visible to everyone reading the thread, including other guests. Internal admin notes do not exist in this surface; if we ever add them, they live in admin UI, not the share page.

### Counters

The "N revisions" counter (from PRD 01) only counts `kind = 'revision'` regardless of author role. Admin response comments never count even if someone forces the kind through some future path; revision creation is restricted server-side to non-admin authors.

## Acceptance

- Posting as an authenticated admin yields `author_role = 'admin'` and `kind = 'admin_response'`, with the team chip rendered.
- Posting as an authenticated viewer yields `author_role = 'viewer'` with the client chip.
- Posting as a guest yields `author_role = 'guest'` with the guest chip and captured name.
- A forged `author_role` in a request body has no effect.
- Backfill produces correct roles for every existing comment row.

## Out of scope

- Storing a permanent guest-to-account link.
- Soft-deleting comments based on role (covered in PRD 06).

## Dependencies

PRD 01 (kind column exists). PRD 02 (gateway). PRD 04 (modal login provides the admin session).
