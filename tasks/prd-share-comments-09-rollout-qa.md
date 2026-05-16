# PRD 09: Rollout, migration, and full acceptance

## Problem

PRDs 01 through 08 touch every share-link surface, every comment row in two tables, every notification path, and the auth gateway. We cannot land that as one big-bang change without breaking active client review threads. We need a feature-flagged rollout and an acceptance matrix that covers parity across calendar and editing share links.

## Goal

A controlled rollout with one external pilot client, a soak period on demo data, a documented cutover, and a full parity acceptance matrix that QA can run against staging.

## Scope

Cross-cutting. Feature flag plumbing, migration sequencing, soak, full parity tests, and a one-week post-launch deprecation of legacy paths.

## Spec

### Feature flag

Name: `share_link_comments_v2`. Scoped per organization (so we can pilot a single client's agency).

Default on prod: `false`. Default on demo client (Nike `27b2baa6-17b0-4a14-a96a-005684d199fd`): `true`.

Both share pages read the flag at the server and render v1 or v2 accordingly. The v1 path stays intact until PRD 09 ends.

### Migration sequence

Order matters. Each migration is reversible up to the point of legacy-column drop.

1. `kind` column added and backfilled (PRD 01).
2. `author_role` column added and backfilled (PRD 05).
3. `deleted_at` column added (PRD 07).
4. `share_link_admin_actions` table created (PRD 06).
5. `share_link_notification_queue` table created (PRD 08).
6. After v2 flips on globally and soaks for 7 days: drop the legacy `status` column from both comment tables. Update the digest cron to stop reading legacy fields.

### Pilot plan

Week 1: v2 on for Nike demo client only. Internal team runs a synthetic review pass against both a calendar share link and an editing share link. Verify the acceptance matrix below. Fix issues.

Week 2: v2 on for one external pilot client (Jack picks). Daily check-in with the strategist on that account. Watch the audit log for unexpected admin action patterns.

Week 3: v2 on for all clients on Monday. Keep v1 code in place until end of week.

Week 4: drop v1 code paths, legacy columns, and the flag.

### Acceptance matrix (parity)

Run all of the below on both `/c/[token]` and `/c/edit/[token]`.

Gateway:

- Anonymous visitor sees the gateway modal.
- Same-agency admin auto-binds without modal; admin chip visible.
- Same-agency viewer auto-binds without modal; viewer chip visible.
- Wrong-agency authenticated visitor sees the gateway and can continue as guest.
- Expired share link shows the expired terminal state with no modal.
- Archived share link shows the archived terminal state with no modal.

Guest:

- Guest name capture accepts, persists in localStorage, restores on refresh.
- Different share link prompts again.
- "Switch" returns to gateway with name pre-filled.
- localStorage blocked falls back to in-memory state without errors.

Login modal:

- Same-agency admin login succeeds and returns to the share link.
- Same-agency viewer login succeeds.
- Wrong-agency login returns 403 with clear copy and does not leave a stuck session.
- Magic-link round trip works if enabled.

Identity:

- Posting as admin yields `author_role = 'admin'` and `kind = 'admin_response'`.
- Posting as viewer yields `author_role = 'viewer'`.
- Posting as guest yields `author_role = 'guest'`.
- Forged `author_role` in the body has no effect.

Comment kinds:

- Composer defaults to feedback.
- Revision toggle switches kind.
- Admin composer locks the toggle and forces admin response.
- Revisions counter equals open-revision count.
- Each kind renders the correct chip.

Admin controls:

- Replace content works on both surfaces.
- Change cover works on calendar.
- Delete soft-archives and clears pending publish for unapproved posts.
- Mark revised resolves all open revisions on the targeted item and emits the event.
- Audit row written for every admin action.
- "View as client" toggle hides admin chrome.

Notifications:

- Each event in the matrix fires through the dispatcher.
- Daily digest contains all expected aggregated events.
- Guests never get direct notifications.
- Idempotency confirmed by replaying a webhook.

Thread:

- One-level reply works on both.
- Frame-pinned timestamp works in editing.
- Soft delete by admin hides the row from the thread.

### Backfill verification

Snapshot the legacy comment counts per kind before migration. After migration, compare:

- `count(*) where status = 'changes_requested'` (legacy) equals `count(*) where kind = 'revision'`.
- Same for the other three legacy values.

If any mismatch: roll back the migration, investigate.

### Rollback plan

If a critical regression lands:

1. Flip `share_link_comments_v2` off for affected orgs.
2. Both share pages serve v1 immediately.
3. New columns stay populated (writes during v2 keep landing in `kind` and `author_role`); v1 reads ignore them.

No data loss.

## Acceptance

- All matrix items pass on staging.
- Pilot week runs without a P1 issue.
- Legacy `status` column dropped only after a clean week post-global-launch.
- Post-launch audit log review shows no wrong-agency action attempts succeeded.

## Out of scope

- Marketing or release-note language. Jack owns that.
- A new admin dashboard view of the audit log (could be a follow-up).

## Dependencies

All of PRD 01 through 08.
