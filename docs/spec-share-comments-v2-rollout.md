# Share-link comments v2: rollout, parity matrix, rollback

PRD 09 wrap-up doc. The v2 stack (PRDs 01-08) shipped incrementally, so
this is the operational reference rather than a big-bang cutover plan.

## Migration sequence

| # | Migration | What it does | Reversible? |
|---|-----------|--------------|-------------|
| 1 | `318_share_comment_kind.sql` | adds `kind` column + backfills from `status` on both comment tables | yes (drop column) |
| 2 | `319_share_comment_author_role.sql` | adds `author_role` + `author_user_id` on both comment tables | yes |
| 3 | `320_share_admin_controls.sql` | creates `share_link_admin_actions` audit table | yes (drop table) |
| 4 | `321_share_comments_v2_flag.sql` | adds `feature_flags jsonb` to organizations | yes |

All four migrations are additive. No legacy column is dropped by this set,
so a rollback is always a no-op on the data side (forward-fix the code).

## Feature flag

`organizations.feature_flags->>'share_link_comments_v2'` is read via
[lib/share/feature-flags.ts](lib/share/feature-flags.ts).

- Missing key, or any value other than literal `false` → v2 enabled.
- Set to `false` to opt a specific org out (kill-switch).

Default is enabled because PRDs 01-08 already shipped to every brand. The
flag is forward-looking insurance, not a blocker for legitimate writes.

To flip a single org off in an emergency:

```sql
UPDATE organizations
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
  || '{"share_link_comments_v2": false}'::jsonb
WHERE id = '<org-uuid>';
```

## Backfill verification

Run after applying migration 318:

```sql
-- Calendar parity: every row's kind matches its legacy status mapping.
SELECT
  COUNT(*) FILTER (WHERE status = 'approved'         AND kind <> 'approval')        AS approval_mismatch,
  COUNT(*) FILTER (WHERE status = 'changes_requested' AND kind <> 'revision')       AS revision_mismatch,
  COUNT(*) FILTER (WHERE status = 'comment'          AND kind NOT IN ('feedback','admin_response')) AS comment_mismatch
FROM post_review_comments;

-- Editing parity: same shape, with video_revised carved out.
SELECT
  COUNT(*) FILTER (WHERE status = 'approved'         AND kind <> 'approval')        AS approval_mismatch,
  COUNT(*) FILTER (WHERE status = 'changes_requested' AND kind <> 'revision')       AS revision_mismatch,
  COUNT(*) FILTER (WHERE status = 'video_revised'    AND kind <> 'video_revised')   AS video_revised_mismatch,
  COUNT(*) FILTER (WHERE status = 'comment'          AND kind NOT IN ('feedback','admin_response')) AS comment_mismatch
FROM editing_project_review_comments;
```

Every counter should return `0`. Any non-zero result means the v1 → v2
shape diverged and the migration backfill needs investigation before
relying on `kind` as the v2 source of truth in read paths.

## Acceptance matrix

Run all of the below on both `/c/[token]` and `/c/edit/[token]`.

### Gateway

- [ ] Anonymous visitor sees the gateway modal.
- [ ] Same-agency admin auto-binds without modal; admin chip visible.
- [ ] Same-agency viewer auto-binds without modal; viewer chip visible.
- [ ] Wrong-agency authenticated visitor sees the gateway and can continue as guest.
- [ ] Expired share link shows the expired terminal state with no modal.
- [ ] Archived share link shows the archived terminal state with no modal.

### Guest

- [ ] Guest name capture accepts, persists in localStorage, restores on refresh.
- [ ] Different share link prompts again.
- [ ] "Switch" returns to gateway with name pre-filled.
- [ ] localStorage blocked falls back to in-memory state without errors.

### Login modal

- [ ] Same-agency admin login succeeds and returns to the share link.
- [ ] Same-agency viewer login succeeds.
- [ ] Wrong-agency login returns 403 with clear copy; no stuck session.
- [ ] Magic-link round trip works if enabled.

### Identity

- [ ] Posting as admin yields `author_role = 'admin'` and `kind = 'admin_response'` on plain comments.
- [ ] Posting as viewer yields `author_role = 'viewer'`.
- [ ] Posting as guest yields `author_role = 'guest'`.
- [ ] Forged `author_role` in the request body has no effect on the row.

### Comment kinds

- [ ] Composer defaults to feedback.
- [ ] Revision toggle switches kind.
- [ ] Admin composer locks the toggle and forces admin response.
- [ ] Revisions counter equals open-revision count.
- [ ] Each kind renders the correct chip + icon (resolveCommentStyle).

### Admin controls (PRD 06)

- [ ] Replace content works on both surfaces; audit row written.
- [ ] Change cover works on calendar; audit row written.
- [ ] Delete soft-archives and clears pending publish for unapproved posts.
- [ ] Mark revised resolves all open revisions on the targeted item.
- [ ] Audit row written for every admin action including auth.login / auth.login.failed.
- [ ] "View as client" toggle hides admin chrome without touching server identity.

### Notifications (PRD 08)

- [ ] Comment by viewer → all admins get a bell ping with the right title.
- [ ] Comment by admin → every viewer in the brand's org gets a bell ping.
- [ ] Daily digest cron continues to roll up cross-surface activity.
- [ ] Guests never get direct notifications.

### Thread parity (PRD 07)

- [ ] One-level reply works on both surfaces.
- [ ] Frame-pinned timestamp works in editing.
- [ ] Attachment chip + tile chrome identical across both pages (shared component).
- [ ] Status icon + tone identical across both pages (shared resolver).

## Rollback plan

If a critical regression lands after deploy:

1. Identify the affected org(s).
2. Flip `share_link_comments_v2` to `false` on those organizations
   (kill-switch SQL above).
3. Forward-fix the regression in code; flip back to default once green.

All four migrations stay applied. No data loss because every change is
additive and v1 read paths still ignore the new columns.

## Out of scope

- Audit-log dashboard view (follow-up).
- Legacy `status` column drop, kept indefinitely until every read path
  has moved to `kind`. Re-evaluate after one quiet quarter.
