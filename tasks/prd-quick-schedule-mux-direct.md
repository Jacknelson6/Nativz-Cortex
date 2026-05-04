# PRD: Quick Schedule Mux-Direct Pivot

## Context

Current Quick Schedule (`components/admin/content-tools/quick-schedule-tab.tsx`) merges two source pipelines:

1. **Internal** — `editing_projects` rows with `status='approved'` + a Drive folder URL
2. **Monday** — Content-Calendar board rows with "EM Approved" label

Both pipelines depend on the editor depositing finished cuts into a **Google Drive folder**, which `lib/calendar/drive-folder.ts` walks server-side. For Monday rows, Drive folder URLs are stored on the Monday item; for internal rows, they live on `editing_projects.drive_folder_url`.

**Friction points:**

- Editor uploads to Drive, then we re-download every cut into our function, then push to Mux. Triple bandwidth tax for every drop.
- Monday + Drive both have to be configured for the legacy path; both fail in different ways (token missing, folder permissions, file naming, MIME guesses).
- The 300s Fluid Compute ceiling sometimes 504s on big drops because the Drive enumeration + per-file Mux ingest happens inline.
- Monday is dead-weight maintenance: the writeback exists only because of the legacy board, which we're trying to retire.
- Editor never sees confirmation that Cortex actually accepted their files until they ping the team.

We already have the building block: the **revision flow** (`app/api/calendar/share/[token]/revision/[postId]/mux-upload/route.ts`) lets the browser PUT bytes directly to Mux via a minted upload URL. We need to apply that exact pattern to the **first cut** of a brand-new post, not just revisions.

## The pivot

**Editor uploads each cut directly to Mux from their browser** via a Cortex share link they're sent when a project enters editing. Drive and Monday stop being hosting layers; they become at most reference-only.

After every successful upload Mux pings our webhook, the row flips `mux_status='ready'` + populates `mux_playback_id`, and the editor sees a green check inline. When the project's full set of posts is uploaded the editor hits "Ready for Jack," which changes `editing_projects.status` to `approved`. Quick Schedule then surfaces it like before, but the Schedule action no longer needs to enumerate Drive: the videos are already in Mux.

## Scope

### In

- New per-project share link the editor uses to upload (`/edit/[token]` or similar; reuse the existing `content_drop_share_links`-style mechanism if a clean fit, or add a sibling `editing_project_share_links` table if not)
- Browser-side direct-to-Mux upload UI for the editor (one card per scheduled post in the project)
- Mux webhook updates `mux_upload_id` → `mux_playback_id` on the right `content_drop_videos` (or new `editing_project_videos`) row
- "Ready for Jack" CTA on the editor's view, gated on every post having `mux_status='ready'`
- Quick Schedule "internal" rows now scheduled directly from Mux playback ids — no Drive walk
- Backwards-compatible read path: existing internal rows that still have only Drive can still be scheduled the old way during transition
- Monday source: keep the read for now (it's a 2-line side branch in the GET route), but drop the writeback

### Out

- Portal-side editor workflow (this is editor-only; editor logs in with a per-project token, no Cortex account)
- Replacing the calendar revision flow (it already works)
- Audio re-transcription pipeline changes (caption seed pipeline stays as-is)
- Mux-direct upload for **assets** (images, raw stills) — only video pivots in this phase
- Migration of historical Drive-stored cuts to Mux (one-shot script if needed, separate task)

## User stories

### US-001: Editor receives a project link and uploads cuts

**Description:** An editor is assigned a project. Jack (or auto from `editing_project.assigned_editor_id`) sends them a `cortex.nativz.io/edit/[token]` link. Token-gated, no login, expires when the project is closed.

**Acceptance:**

- [ ] Page loads with project name + brand logo + scheduled post list (one card per post)
- [ ] Each card shows: post slot date, draft caption, current state (`pending` / `uploading` / `processing` / `ready`)
- [ ] Editor clicks Upload on a card → browser PUTs file directly to Mux via the minted upload URL (mirror the revision-flow pattern: 4.5 MB Vercel limit bypassed)
- [ ] Progress bar shown during upload; on completion, card flips to `processing`, then `ready` when the webhook ticks
- [ ] Re-upload (replace) works — mints a fresh upload URL, archives the previous `mux_asset_id`
- [ ] Token validation: expired → 410; revoked → 404
- [ ] No login wall; no admin telemetry shows the editor as a Cortex user

### US-002: "Ready for Jack" gate

**Description:** Editor signals project complete; status flips to `approved` and shows up in Quick Schedule.

**Acceptance:**

- [ ] CTA at the bottom of the editor page; disabled while any post is `pending` / `uploading` / `processing`
- [ ] On click, PATCHes `editing_projects.status` from `in_progress` → `approved`, stamps `approved_at = now()`
- [ ] Optional one-line note ("Caption tweak on post 3") sent to Jack via existing notification channel
- [ ] Toast confirms; CTA replaces with "Ready for Jack" badge + timestamp
- [ ] Edge case: editor uploads, hits Ready, then later wants to swap a clip — gate flips back to `pending` for that one post on re-upload, CTA re-enables

### US-003: Quick Schedule consumes Mux playback ids directly

**Description:** When Jack hits Schedule on an internal row, the pipeline uses `mux_playback_id` per post instead of walking Drive.

**Acceptance:**

- [ ] `runCalendarPipeline` (or the internal branch only) accepts a list of `{ scheduled_post_id, mux_playback_id, mux_asset_id }` and skips the Drive enumeration
- [ ] Static MP4 rendition (already enabled via `mp4_support: 'capped-1080p'`) is the source for Zernio / Late ingest
- [ ] If a row still lacks Mux ids (legacy in-flight projects), fall back to existing Drive walk — log warning
- [ ] Internal Schedule action is now ~3-5s instead of 30-90s (no Drive enumeration, no re-ingest into Mux)
- [ ] Monday writeback REMOVED from internal path (already absent); Monday-source rows keep their writeback for now

### US-004: Editor link admin surface

**Description:** Jack can mint, revoke, and copy editor links per project.

**Acceptance:**

- [ ] On `editing_projects` detail (or wherever the project lives in admin), an "Editor link" section shows: link, expires, revoke button
- [ ] "Mint link" button if none exists; "Copy" + "Open" + "Revoke" actions if one does
- [ ] Revoked link → 404
- [ ] Expiry default: 60 days from mint, configurable later

### US-005: Webhook handles editor-uploaded cuts

**Description:** `/api/mux/webhook` already updates revision rows. Extend to handle first-cut uploads from the editor link.

**Acceptance:**

- [ ] `video.asset.created` matches by `mux_upload_id` → flips `mux_status='processing'`, stamps `mux_asset_id`
- [ ] `video.asset.ready` → `mux_status='ready'`, stamps `mux_playback_id`
- [ ] Static MP4 rendition completion → stamps `mp4_url` so the publish cron has a downloadable
- [ ] Errored asset → `mux_status='errored'`, error surfaced on editor card

## Database

**New table** (`supabase/migrations/227_editing_project_share_links.sql`):

```sql
create table editing_project_share_links (
  id uuid primary key default gen_random_uuid(),
  editing_project_id uuid not null references editing_projects(id) on delete cascade,
  token text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null
);

create index editing_project_share_links_project_idx
  on editing_project_share_links(editing_project_id);
create index editing_project_share_links_token_idx
  on editing_project_share_links(token);
```

**Existing tables** — confirm `content_drop_videos` (or `editing_project_videos`) has all needed Mux fields. Likely already does given the revision flow uses them.

## API surface

**New:**

- `POST /api/admin/editing-projects/[id]/share-link` (admin): mint
- `DELETE /api/admin/editing-projects/[id]/share-link/[linkId]` (admin): revoke
- `GET /api/edit/[token]` (token-gated, no auth): project view payload
- `POST /api/edit/[token]/post/[postId]/mux-upload` (token-gated): mint Mux upload URL — copy of `app/api/calendar/share/[token]/revision/[postId]/mux-upload/route.ts` adapted for editing-project token
- `POST /api/edit/[token]/post/[postId]/mux-finalize` (token-gated): stamp `revised_video_uploaded_at` equivalent
- `POST /api/edit/[token]/ready-for-jack` (token-gated): flip `editing_projects.status` to `approved`

**Modified:**

- `app/api/admin/content-tools/quick-schedule/start/route.ts` (internal branch): use Mux ids when present, fallback to Drive
- `app/api/mux/webhook/route.ts`: handle first-cut events too (likely already does — verify)

## Constraints

- **NEVER USE EM DASHES.** Use commas, periods, colons, parens, or `-`.
- **Push to main only.** No feature branches.
- **Sentence case** in product UI; admin sidebar exception.
- **AI/data null-safe** (`?? []`, `?? ''`).
- **Token-gated routes never call `getUser()` for auth** — token IS the auth. But validate token on every request (expired, revoked, FK still exists).
- **Admin routes** use `createAdminClient()` only after verifying `isAdmin(user.id)`.
- **Tailwind tokens** — no raw hex; match revision-flow editor surface for visual consistency.
- **Mux SDK** — reuse `getMux()` from `lib/mux/client.ts`. Never instantiate directly.
- **CORS origin** — copy the `headerOrigin || NEXT_PUBLIC_APP_URL || new URL(req.url).origin` chain from the revision route. The retry logic is non-obvious and we already paid for that lesson.
- **Static MP4 rendition** (`mp4_support: 'capped-1080p'`) is REQUIRED on every minted upload — Zernio/Late ingest needs an MP4, not HLS. This bit me before; keep it.

## Open questions

1. **Token model:** Should `editing_project_share_links` be its own table, or should we reuse `content_drop_share_links` with a kind discriminator? Leaning own-table because the lifecycle is different (project-scoped, not drop-scoped).

2. **Notifications:** When editor hits "Ready for Jack," do we email Jack, ping Slack, or just rely on Quick Schedule reload? Default to email + the existing notification registry; Jack can mute later.

3. **Backwards compat:** Existing in-flight `editing_projects` with Drive folders only — do we migrate them via a one-shot script, or just let them drain through the legacy path? Default to drain; flag a counter in admin so we know when zero remain.

4. **Editor identity:** Should we surface "uploaded by [editor name]" anywhere? Token doesn't carry identity. If yes, we either ask name on first upload (cheap) or attach `assigned_editor_id` from the project. Default to project assignment if known, otherwise generic "editor."

## Acceptance criteria

- [ ] Editor can open token link, see project, upload all cuts, hit Ready
- [ ] Mux webhook flips state correctly; UI reflects state without manual refresh
- [ ] Quick Schedule action skips Drive walk when Mux ids present, takes <5s for a typical 8-post drop
- [ ] Admin can mint, copy, revoke editor link
- [ ] Migration applied; no existing rows broken
- [ ] Monday source still works (read + writeback) for legacy in-flight items
- [ ] Typecheck + lint clean (skip `tmp/ac-refs/**` pre-existing errors)
- [ ] One end-to-end smoke test on a real Beaux project (or seeded test project)
- [ ] Old Drive-walk path not deleted, just bypassed when Mux ids exist

## Migration / rollout

1. Land migration + token table behind a feature flag (`NEXT_PUBLIC_MUX_DIRECT_EDITOR`)
2. Mint links manually for one editor on one project; validate end-to-end
3. Remove flag once two full drops have been delivered via Mux-direct
4. Mark Drive walk path with deprecation comment + counter on internal Schedule for "fell back to Drive" so we can see when it hits zero
5. Delete Drive walk after 30 consecutive days at zero

## Files

**Create:**
- `supabase/migrations/227_editing_project_share_links.sql`
- `app/edit/[token]/page.tsx`
- `app/edit/[token]/editor-uploader.tsx` (client)
- `app/api/edit/[token]/route.ts`
- `app/api/edit/[token]/post/[postId]/mux-upload/route.ts`
- `app/api/edit/[token]/post/[postId]/mux-finalize/route.ts`
- `app/api/edit/[token]/ready-for-jack/route.ts`
- `app/api/admin/editing-projects/[id]/share-link/route.ts`
- `app/api/admin/editing-projects/[id]/share-link/[linkId]/route.ts`
- `lib/editor-link/token.ts` (mint, validate, revoke)

**Modify:**
- `app/api/admin/content-tools/quick-schedule/start/route.ts` (internal branch — Mux-first)
- `app/api/mux/webhook/route.ts` (verify first-cut handling)
- `components/admin/content-tools/quick-schedule-tab.tsx` (no UI change required if Schedule action is still per-row; verify)
- Some admin editing-project detail page (whichever currently exists) — add Editor link panel

**Reference (do not edit unless needed):**
- `app/api/calendar/share/[token]/revision/[postId]/mux-upload/route.ts` (copy pattern from)
- `lib/mux/client.ts`
- `lib/calendar/run-pipeline.ts`
- `lib/calendar/drive-folder.ts`

## Why this matters

Cuts the Drive dependency for new work, removes a 30-90s schedule action, gives editors a confirmation surface, and starts retiring the Monday writeback. After this lands, the legacy Monday board can be read-only or archived entirely.
