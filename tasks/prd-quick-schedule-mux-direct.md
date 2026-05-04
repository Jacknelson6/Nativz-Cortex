# PRD: Editor Dashboard Access + Mux-Direct Raw Footage

## Context

Editors currently work outside Cortex. They drop finished cuts into a Google Drive folder, Cortex enumerates that folder server-side, downloads each cut, and pushes to Mux for hosting. Drive is a hosting layer we don't need; the round-trip costs bandwidth, time (sometimes 504s), and a brittle dependency on folder permissions.

We already have the building block: the **revision flow** at `app/api/calendar/share/[token]/revision/[postId]/mux-upload/route.ts` mints a Mux direct-upload URL the browser PUTs bytes to, bypassing Vercel's 4.5 MB body limit. Same pattern works for first-cut uploads.

**The pivot:** Editors get **real Cortex dashboard access** (new `editor` role). They log in, land on the Content Tools dashboard, see a new **Raw footage** tab listing every project they own, and upload cuts directly to Mux from the browser. When all posts in a project are uploaded, they hit **Send to scheduling** and the project flips to `approved`. Jack then sees it in the existing Quick Schedule tab (renamed **Scheduling**) and ships it.

No per-project share links, no token gating, no Drive enumeration on schedule. Editors get a real workspace, Jack gets a real handoff signal.

## Why this model (vs share links)

- Editors are recurring partners, not one-off form-fillers. They benefit from a persistent view of their queue across all clients.
- We already have role-based auth + sidebar gating (`admin` vs `viewer`). Adding `editor` is a small shape change, not a new auth system.
- "Raw footage" tab lives in the same dashboard Jack already opens daily; less context-switching when something goes wrong.
- Per-project tokens would mean minting / revoking / expiring links for every project forever. A login replaces that with a single user lifecycle.

## Scope

### In

- New `editor` role with scoped dashboard access
- New **Raw footage** tab on Content Tools (`/admin/content-tools`) — visible to editors + admins
- Per-project card in Raw footage with one upload slot per scheduled post
- Browser-side direct-to-Mux upload using the proven revision-flow mechanic
- Mux webhook updates `mux_status` / `mux_playback_id` on the post row
- **Send to scheduling** CTA per project, gated on every post being `mux_status='ready'`
- Rename **Quick schedule** tab → **Scheduling**
- Scheduling tab consumes `mux_playback_id` directly (no Drive walk) when present
- Editor invitation flow (Jack adds an editor by email, they get an invite link, they set a password)
- Sidebar gating: editors only see Content Tools (no analytics, no clients, no settings beyond their profile)

### Out

- Portal-side editor workflow (editors log in to admin shell, not portal shell)
- Replacing the calendar revision flow (it already works)
- Audio re-transcription pipeline changes
- Direct-to-Mux uploads for raw assets (images, B-roll) — only video pivots in this phase
- Migration of historical Drive-stored cuts to Mux (one-shot script if needed, separate task)
- Cross-editor visibility (editor A seeing editor B's projects) — default to "see only assigned-to-me," can flip later
- Monday board read path stays untouched in this phase

## User stories

### US-001: Editor signs in and sees their queue

**Description:** Editor logs in with email + password (set via invite). Lands on `/admin/content-tools?tab=raw-footage`. Sees a card per `editing_projects` row where `assigned_editor_id = me` and `status IN ('in_progress', 'in_review')`.

**Acceptance:**

- [ ] Login at `/admin/login` works for `role='editor'`
- [ ] Sidebar shows only Content Tools (and a profile/sign-out)
- [ ] Visiting any other admin route redirects to `/admin/content-tools`
- [ ] Default landing tab for editors is `raw-footage`
- [ ] Empty state if no assigned projects: "Nothing in your queue right now."

### US-002: Editor uploads cuts per scheduled post

**Description:** Each project card expands into a list of scheduled posts. Each post row has an upload slot.

**Acceptance:**

- [ ] Card shows: project name, brand logo + name, assignment date, post count, completion progress (X of Y posts uploaded)
- [ ] Expanded view: one row per scheduled post with slot date + draft caption + state badge (`pending` / `uploading` / `processing` / `ready` / `errored`)
- [ ] Upload button mints a Mux direct-upload URL via new endpoint, browser PUTs file directly
- [ ] Progress bar during upload; row flips to `processing`, then `ready` on webhook tick (no manual refresh)
- [ ] Re-upload (replace) supported — mints fresh upload URL, archives previous `mux_asset_id`
- [ ] Errored uploads show inline error + retry button
- [ ] Per-post note field (caption tweak, framing concern) saved to `editing_project_post_notes` for Jack's review

### US-003: Send to scheduling

**Description:** Once every post in a project is `mux_status='ready'`, editor hits **Send to scheduling**.

**Acceptance:**

- [ ] CTA at the bottom of each project card; disabled until all posts are `ready`
- [ ] Disabled state explains why ("3 of 8 posts still processing")
- [ ] On click, PATCHes `editing_projects.status` to `approved`, stamps `approved_at = now()` and `approved_by = editor.id`
- [ ] Toast confirms; card moves to "Sent" section (or grayed out with timestamp)
- [ ] Jack receives notification via existing notification registry (email + in-product banner)
- [ ] If editor wants to swap a clip after sending, they re-upload the affected post → that post flips back to `processing`, project status flips back to `in_progress`, Send CTA re-enables when ready

### US-004: Jack ships from Scheduling tab

**Description:** Renamed tab. Internal-source rows (the path we're optimizing) skip Drive entirely.

**Acceptance:**

- [ ] Tab label changes from "Quick schedule" to "Scheduling" everywhere (sidebar pill, tab nav, page title)
- [ ] `runCalendarPipeline` (or its internal branch only) accepts `{ scheduled_post_id, mux_playback_id, mux_asset_id }[]` and skips Drive enumeration
- [ ] Static MP4 rendition (already on via `mp4_support: 'capped-1080p'`) is the source for Zernio / Late ingest
- [ ] If a row lacks Mux ids (legacy in-flight projects), fall back to existing Drive walk and log a counter
- [ ] Internal Schedule action is now ~3 to 5s instead of 30 to 90s

### US-005: Admin manages editors

**Description:** Jack can invite, deactivate, and reassign editors.

**Acceptance:**

- [ ] In `/admin/users`, role filter includes "Editor"
- [ ] "Invite editor" button mints invite link via existing invite_tokens table; email goes out
- [ ] Editor sets password on accept (mirrors existing portal join flow but lands in admin shell)
- [ ] Deactivating an editor revokes session + reassigns their open projects to a placeholder for Jack to triage
- [ ] Editor can update their own profile (name, avatar, password) but nothing else

### US-006: Mux webhook handles editor uploads

**Description:** Extend `/api/mux/webhook` to handle first-cut uploads from editors (likely already supports this since the revision flow uses it).

**Acceptance:**

- [ ] `video.asset.created` matches by `mux_upload_id` → flips `mux_status='processing'`, stamps `mux_asset_id`
- [ ] `video.asset.ready` → `mux_status='ready'`, stamps `mux_playback_id`
- [ ] Static MP4 rendition completion → stamps `mp4_url` so the publish cron has a downloadable
- [ ] Errored asset → `mux_status='errored'`, error surfaced on editor card

## Database

**Migration** (`supabase/migrations/227_editor_role.sql`):

```sql
-- Extend role check to allow 'editor'
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin', 'super_admin', 'viewer', 'editor'));

-- Per-post notes the editor can leave for Jack
create table editing_project_post_notes (
  id uuid primary key default gen_random_uuid(),
  scheduled_post_id uuid not null references scheduled_posts(id) on delete cascade,
  editor_id uuid not null references users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index editing_project_post_notes_post_idx
  on editing_project_post_notes(scheduled_post_id);
```

Existing `content_drop_videos` (or equivalent `editing_project_videos`) already has the Mux fields needed — verify before adding more columns.

`assigned_editor_id` on `editing_projects` already exists; if not, add it referencing `users(id)`.

## API surface

**New:**

- `POST /api/admin/content-tools/raw-footage/post/[postId]/mux-upload` (admin OR editor): mint Mux upload URL. Editor gated to posts in projects assigned to them.
- `POST /api/admin/content-tools/raw-footage/post/[postId]/mux-finalize` (admin OR editor): stamp uploaded_at, optional note
- `POST /api/admin/content-tools/raw-footage/project/[id]/send-to-scheduling` (editor only): flip status to approved
- `GET /api/admin/content-tools/raw-footage` (admin OR editor): the editor's queue payload (admin sees all, editor sees assigned)
- `POST /api/admin/users/invite-editor` (admin): mint invite token + send email

**Modified:**

- `app/api/admin/content-tools/quick-schedule/start/route.ts` (internal branch): use Mux ids when present, fallback to Drive
- `app/api/mux/webhook/route.ts`: verify first-cut handling
- Sidebar gating logic (`components/layout/admin-sidebar.tsx` + `admin-brand-pill.tsx`): editor role hides everything except Content Tools
- Tab rename: `'quick-schedule'` slug stays for URL backward-compat, label changes to "Scheduling"
- `lib/auth/permissions.ts`: add `isEditor()`, update `isAdmin()` to NOT include editors

## Constraints

- **NEVER USE EM DASHES.** Use commas, periods, colons, parens, or `-`.
- **Push to main only.** No feature branches.
- **Sentence case** in product UI; admin sidebar exception.
- **AI/data null-safe** (`?? []`, `?? ''`).
- **Editor scoping is enforced server-side.** Don't trust the client to filter; every editor-accessible API route must verify `assigned_editor_id = user.id` (or admin).
- **Mux SDK** — reuse `getMux()` from `lib/mux/client.ts`. Never instantiate directly.
- **CORS origin** — copy the `headerOrigin || NEXT_PUBLIC_APP_URL || new URL(req.url).origin` chain from the revision route. The retry logic is non-obvious and we already paid for that lesson.
- **Static MP4 rendition** (`mp4_support: 'capped-1080p'`) is REQUIRED on every minted upload — Zernio/Late ingest needs an MP4, not HLS.
- **Tailwind tokens** — match the existing Content Tools shell visual baseline; no raw hex.

## Open questions

1. **Editor visibility scope:** Default to "see only projects where `assigned_editor_id = me`." If editors collaborate, we can flip to "see all in-progress projects" via a setting. Default narrow.

2. **Post-send edits:** When editor re-uploads after sending, do we auto-flip status back to `in_progress`, or require an "Unlock for re-edit" action? Default to auto-flip with an in-product warning the first time.

3. **Notification fan-out:** Send-to-scheduling event hits which channels? Default: in-product banner for Jack + entry in notifications hub. No email unless Jack opts in.

4. **Backwards compat:** Existing in-flight `editing_projects` with Drive folders only — do we migrate them via a one-shot script, or just let them drain through the legacy path? Default to drain; flag a counter so we know when zero remain.

5. **Editor profile fields:** Anything beyond name/avatar/password (e.g., timezone, hours)? Default: name + avatar + password only. Add later if useful.

## Acceptance criteria

- [ ] Editor role added to schema; can log in; sidebar shows only Content Tools
- [ ] Raw footage tab shows assigned projects with per-post upload slots
- [ ] Editor can upload directly to Mux; state updates without manual refresh
- [ ] Send to scheduling flips status correctly; gated on full upload completion
- [ ] Scheduling tab (renamed) skips Drive walk when Mux ids present, takes <5s for a typical 8-post drop
- [ ] Admin can invite, deactivate, reassign editors
- [ ] Migration applied; no existing rows broken
- [ ] Monday source still works (read + writeback) for legacy in-flight items
- [ ] Typecheck + lint clean (skip `tmp/ac-refs/**` pre-existing errors)
- [ ] One end-to-end smoke test on a real Beaux project (or seeded test project) with a real editor user
- [ ] Old Drive-walk path not deleted, just bypassed when Mux ids exist

## Migration / rollout

1. Land migration + role behind a feature flag (`NEXT_PUBLIC_EDITOR_DASHBOARD`)
2. Seed one editor account, assign to one project, validate end-to-end
3. Remove flag once two full drops have been delivered via Mux-direct
4. Mark Drive walk path with deprecation comment + counter on internal Schedule for "fell back to Drive" so we can see when it hits zero
5. Delete Drive walk after 30 consecutive days at zero

## Files

**Create:**
- `supabase/migrations/227_editor_role.sql`
- `components/admin/content-tools/raw-footage-tab.tsx`
- `components/admin/content-tools/raw-footage-project-card.tsx`
- `components/admin/content-tools/raw-footage-post-row.tsx` (upload slot UI)
- `app/api/admin/content-tools/raw-footage/route.ts`
- `app/api/admin/content-tools/raw-footage/post/[postId]/mux-upload/route.ts`
- `app/api/admin/content-tools/raw-footage/post/[postId]/mux-finalize/route.ts`
- `app/api/admin/content-tools/raw-footage/project/[id]/send-to-scheduling/route.ts`
- `app/api/admin/users/invite-editor/route.ts`

**Modify:**
- `components/admin/content-tools/content-tools-shell.tsx` — add raw-footage tab; rename quick-schedule label to "Scheduling"
- `components/layout/admin-sidebar.tsx` — gate sidebar items by role; editors see only Content Tools
- `components/layout/admin-brand-pill.tsx` — hide brand pill for editors (they're not brand-scoped)
- `lib/auth/permissions.ts` — add `isEditor()`; tighten `isAdmin()` to exclude editors
- `app/api/admin/content-tools/quick-schedule/start/route.ts` — internal branch uses Mux ids first
- `app/api/mux/webhook/route.ts` — verify first-cut handling
- `app/admin/users/page.tsx` (or equivalent) — add Invite editor action + role filter

**Reference (do not edit unless needed):**
- `app/api/calendar/share/[token]/revision/[postId]/mux-upload/route.ts` (copy pattern from)
- `lib/mux/client.ts`
- `lib/calendar/run-pipeline.ts`
- `lib/calendar/drive-folder.ts`

## Why this matters

Cuts Drive out of the upload path, gives editors a real workspace instead of one-off links, gives Jack a clean handoff signal, and removes the per-project token-minting overhead. After this lands, the legacy Monday board can be read-only or archived entirely.
