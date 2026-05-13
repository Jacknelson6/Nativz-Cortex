# Team — Mobile PRD

**Route:** `/admin/team`
**Actor:** admin / super-admin
**Sidebar:** Not in sidebar (live but orphaned). Reach via deep link.

## Purpose
Internal team-member roster. The `team_members` table is standalone (no FK to `auth.users`); used for strategist/editor/PM assignment across client work. Invite flow → links a team_member to an auth user.

## Desktop UI (UNCHANGED)
- Table with avatar, name, email, role/title, linked-user state, kebab (invite, edit, deactivate).

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5**

### List
- Table → card list. Card: avatar, name, role/title, linked-account status pill ("linked" or "invite pending"), kebab.

### Invite
- Same pattern as Users invite. Sheet with name, email, role title fields, then Send invite.

### Edit
- Tap card → opens edit sheet. Fields: full name, email, role, avatar upload, active toggle.

## Out of scope
- Workload board (link out to `/admin/team/[id]/workload` if surfaced; current page is light).

## Acceptance criteria
- Sending an invite mirrors `scripts/send-jaime-invite.ts` flow via the admin UI.
- Desktop diff = 0 at `lg+`.
