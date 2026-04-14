# Personal moodboards — replacement for the Notes section

> Status: spec, not yet built. Authored 2026-04-14.
> Owner: Jack. Builder: SRL (with human checkpoints at end of each phase).

## tl;dr

Each Cortex user gets their own personal moodboard. Paste a TikTok / Reel / Short URL, the system fetches the video, extracts frames + transcript + hook analysis + clip breakdown, and drops it onto the user's canvas as a node they can move, comment on, and reference. Almost the entire backend already exists — most of this is wiring + UI + a single ownership-model migration.

## Goals

1. **Per-user content capture** — every Cortex user has at least one personal moodboard, automatically created on first visit.
2. **Frictionless ingestion** — paste a URL into a single input, get a fully-processed video node within ~30s.
3. **Full breakdown surface** — for every video node, show transcript, hook analysis, frame strip, vision clip breakdown, stats, and a "rescript for client X" action.
4. **Replace the Notes sidebar item** — `Notes` in the main sidebar (currently → `/admin/presentations`) becomes "My boards" → `/admin/notes`. The presentations feature stays, surfaced elsewhere (see open questions).

## Non-goals (v1)

- Real-time multi-user collaboration on personal boards. Personal boards are private; no shared cursors.
- Mobile authoring. Read-only mobile view is fine; the create/edit experience is desktop-first like the existing client moodboards.
- Importing videos that aren't TikTok / Instagram Reels / YouTube Shorts. Add Twitter / LinkedIn later.
- AI-generated boards from a prompt. v1 is paste-driven only.
- Migrating users' existing presentations into moodboards. They are different concepts and stay separate.

## Current state — what already exists (and what doesn't)

The backend is overwhelmingly already built. This is mostly a re-skin + ownership change.

### Already built ✅

| Layer | What | Where |
|---|---|---|
| DB | `moodboard_boards`, `moodboard_items`, `moodboard_notes`, `moodboard_comments`, `moodboard_edges`, `moodboard_share_links` | `supabase/migrations/010_create_moodboard_tables.sql` |
| DB | `moodboard_items` already stores transcript, hook, hook_score, hook_type, cta, concept_summary, pacing, caption_overlays, content_themes, winning_elements, improvement_areas, replication_brief, rescript, mediapipe_analysis, frames, thumbnail_candidates, position_x/y, width, height | same migration |
| Storage | `moodboard-frames` Supabase Storage bucket (public read, authed upload) | referenced in `lib/video/browser-frame-extractor.ts:83` |
| Apify | TikTok metadata + video URL via tikwm + fallback HTML scrape | `lib/tiktok/scraper.ts`, `lib/tiktok/apify-run.ts` |
| Apify | Instagram Reel scraper | `lib/instagram/scraper.ts` |
| Apify | Facebook Reels scraper | `lib/audit/scrape-facebook-profile.ts` |
| Pipeline | Transcript extraction (TikTok / IG / YouTube) | `lib/analysis/moodboard-transcribe-internal.ts:54-146` |
| Pipeline | Hook + strategy LLM analysis | `lib/analysis/moodboard-analyze-internal.ts:13-104` |
| Pipeline | Vision clip breakdown (Gemini 2.0 Flash multimodal, ≤14 sampled frames) | `lib/moodboard/vision-clip-breakdown.ts` |
| Pipeline | Server-side frame extraction (FFmpeg via `fluent-ffmpeg` + `ffmpeg-static`, every 3s) | `lib/search/topic-search-source-extract-frames.ts:46-86` |
| Pipeline | Browser-side frame extraction (canvas, 4 FPS, ≤200 frames) | `lib/mediapipe/frame-extractor.ts` |
| Pipeline | Brand-adapted rescript via OpenRouter | `lib/analysis/moodboard-rescript-internal.ts:10-154` |
| API | Full board + item + note + comment + edge CRUD, transcribe, analyze, rescript, extract-frames, replicate, video-url, thumbnail | `app/api/analysis/**` |
| UI | ReactFlow canvas + video / image / website / sticky nodes + analysis side panel + share-link view | `components/moodboard/**`, `app/admin/moodboard/[id]/page.tsx`, `app/shared/moodboard/[token]/page.tsx` |

### Net-new ❗

| Layer | What | Why |
|---|---|---|
| DB | `moodboard_boards.user_id` column (nullable, FK → `users.id`) + index | Boards are client-scoped today. Personal = user-scoped. |
| DB | `moodboard_boards.is_personal` boolean (defaults false) | Distinguishes personal from client/team boards in queries + UI. |
| DB | RLS rewrite — current policies are admin-only on every row. Personal boards need owner-scoped policies (user can only see their own). | Admin-only blocks personal use entirely. |
| API | `GET /api/moodboard/personal` — returns the caller's personal board, auto-creating it on first call | New entry point. |
| API | All existing `app/api/analysis/boards/**` and `items/**` routes need an additional auth check: if `is_personal=true`, only `created_by === auth.uid()` (not just role=admin). | Minimal patch per route. |
| UI | `/admin/notes` route — the personal board canvas. Shells the existing `<MoodboardCanvas>` component with the user's personal board id. | New route, ~50 lines. |
| UI | Sidebar: rename "Notes" → "My boards", point at `/admin/notes` instead of `/admin/presentations`. | One-line nav change. |
| UI | "Paste URL" hero input above the canvas — single textarea, accepts pasted URLs (one per line), POSTs to existing `/api/analysis/items`, shows queued items as skeleton nodes that fill in as the pipeline runs. | Net-new component. The API exists; this is the UX wrapper. |
| UI | Per-node "Open breakdown" panel — the existing `<VideoAnalysisPanel>` already renders all the fields; just needs to be the default click action instead of an explicit button. | UX polish. |
| Storage | Path convention change: store personal-board frames under `personal/{user_id}/{board_id}/{frame_uuid}.jpg` instead of bucket root. | Hygiene + future per-user quotas. |

### Wrong assumption corrected

I told Jack in the brainstorm that **FFmpeg was the only net-new infra**. That's wrong — FFmpeg is already wired (`lib/search/topic-search-source-extract-frames.ts`, `fluent-ffmpeg` + `ffmpeg-static` in deps). The actual net-new infra is **the per-user ownership model + RLS**.

## Data model

### Migration `102_personal_moodboards.sql`

```sql
-- Personal moodboards: per-user content capture canvases
alter table moodboard_boards
  add column user_id uuid references public.users(id) on delete cascade,
  add column is_personal boolean not null default false;

create index moodboard_boards_user_id_personal_idx
  on moodboard_boards (user_id) where is_personal = true;

-- Constraint: personal boards must have user_id, others must not
alter table moodboard_boards
  add constraint moodboard_boards_personal_ownership_chk
  check (
    (is_personal = true and user_id is not null and client_id is null)
    or (is_personal = false and user_id is null)
  );

-- RLS: personal boards visible only to their owner
drop policy if exists moodboard_boards_admin_all on moodboard_boards;

create policy moodboard_boards_personal_owner on moodboard_boards
  for all
  using (
    is_personal = true and user_id = auth.uid()
  )
  with check (
    is_personal = true and user_id = auth.uid()
  );

create policy moodboard_boards_team_admin on moodboard_boards
  for all
  using (
    is_personal = false
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  )
  with check (
    is_personal = false
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- Mirror policies on moodboard_items / notes / comments / edges via board_id
-- (one block per child table, omitted here for brevity — same pattern)
```

### Auto-create on first visit

```ts
// lib/moodboard/get-or-create-personal-board.ts
export async function getOrCreatePersonalBoard(userId: string) {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('moodboard_boards')
    .select('*')
    .eq('user_id', userId)
    .eq('is_personal', true)
    .maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await admin
    .from('moodboard_boards')
    .insert({
      name: 'My board',
      description: 'Personal moodboard',
      user_id: userId,
      created_by: userId,
      is_personal: true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return created;
}
```

## API surface

### New routes

- `GET /api/moodboard/personal` → `{ board, items, notes, edges }`. Auto-creates the board on first call. Auth required. Returns 401 for unauthenticated.

### Routes that need a per-route auth amendment

For each route under `app/api/analysis/boards/**` and `app/api/analysis/items/**`, add the following pattern at the top of the handler:

```ts
// Replace: existing role=admin check
// With:
const isAdmin = userData?.role === 'admin';
if (!isAdmin) {
  // Non-admin: must own the personal board this resource belongs to
  const { data: board } = await admin
    .from('moodboard_boards')
    .select('id, user_id, is_personal')
    .eq('id', boardId)
    .single();
  if (!board || !board.is_personal || board.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
```

A helper `requireBoardAccess(boardId, user)` in `lib/moodboard/auth.ts` keeps it DRY.

### Routes that stay admin-only

- `boards/[id]/share/route.ts` — share links are an admin-only thing for client boards. Personal boards don't get share links in v1. Return 403 if `is_personal=true`.
- `boards/from-topic-search/route.ts` — auto-creates client-scoped analysis boards. No change.

## UI

### `/admin/notes` (new)

```
┌──────────────────────────────────────────────────────────────┐
│  My board                                       [⚙ settings] │
│  Paste TikTok / Reel / Short URLs to add them                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Paste a URL or drop a video file...                    │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                              [+ Add to board]                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│           ┌──────────┐    ┌──────────┐                       │
│           │ video #1 │    │ video #2 │     (ReactFlow        │
│           │ skeleton │    │ playable │      canvas — same    │
│           └──────────┘    └──────────┘      one client       │
│                                             boards use)      │
│                ▲ click → opens breakdown panel               │
└──────────────────────────────────────────────────────────────┘
```

Implementation: thin client-side page that fetches `/api/moodboard/personal`, mounts the existing `<MoodboardCanvas>` with the returned board, adds a `<PasteUrlBar>` above the canvas. Reuse 100% of the existing canvas + nodes + analysis panel.

### `<PasteUrlBar>` (new, ~120 lines)

- Single textarea, autosize. Detects URLs on paste/blur/Enter.
- For each URL, POSTs to `/api/analysis/items` with the personal board's `board_id`.
- Each pending URL becomes a skeleton node on the canvas immediately (optimistic UI).
- Pipeline runs in the background — node fills in as `transcribe`, `analyze`, `extract-frames`, `vision-clip-breakdown` complete (existing flow at `lib/moodboard/process-video.ts`).
- Drag-drop for video files (uploads to a bucket, then runs the same pipeline minus the URL fetch step) — defer to v1.5 if it's not trivial.

### Sidebar update

In `components/layout/admin-sidebar.tsx`:

```diff
-  { href: '/admin/presentations', label: 'Notes', icon: StickyNote },
+  { href: '/admin/notes', label: 'My board', icon: StickyNote },
```

The old `/admin/presentations` route stays alive — it just loses its sidebar entry. See open questions about where it lands instead.

## Build sequence

Phased so each commit stands on its own.

### Phase 1 — Data model + auth (foundation)

1. Write migration `102_personal_moodboards.sql` per above.
2. Apply via Supabase MCP, verify constraint + RLS work with a manual test.
3. Add `lib/moodboard/auth.ts` with `requireBoardAccess` helper.
4. Add `lib/moodboard/get-or-create-personal-board.ts`.
5. Add `app/api/moodboard/personal/route.ts` (GET).
6. Patch every route under `app/api/analysis/boards/**` and `items/**` to use `requireBoardAccess` instead of admin-only check. ~15 file diff.
7. Add unit tests for the auth helper (admin sees client boards, viewer doesn't, owner sees own personal board, owner doesn't see other users' personal boards).

**Definition of done:** I can `curl /api/moodboard/personal` as a non-admin user and get back an auto-created board.

### Phase 2 — UI shell

1. Create `app/admin/notes/page.tsx`. Server component fetches personal board via the new API; passes id to a client wrapper.
2. Create `components/notes/personal-moodboard.tsx` — thin client component that mounts `<MoodboardCanvas>` with the personal board.
3. Add the sidebar swap (`Notes` → `My board`, `/admin/presentations` → `/admin/notes`).
4. Empty-state copy when board has zero items.
5. Verify the existing canvas / node / panel components render correctly with `is_personal=true` boards (they should — they don't care).

**Definition of done:** I can navigate to `/admin/notes`, see an empty canvas with a "paste a URL" hero, and the canvas itself is the same drag-drop ReactFlow surface client moodboards use.

### Phase 3 — Paste URL bar + skeleton nodes

1. Build `<PasteUrlBar>` component.
2. Wire to `/api/analysis/items` POST.
3. Optimistic skeleton node on canvas for each pending URL.
4. Subscribe to item updates (Supabase realtime channel filtered by board_id) so nodes fill in as the pipeline progresses.
5. Toast on completion: "Hook analyzed — click to view breakdown."

**Definition of done:** Paste a TikTok URL, see a skeleton node appear, watch it become a fully-analyzed video node within 30s without refreshing.

### Phase 4 — Per-node breakdown polish

1. Default click action on a video node = open `<VideoAnalysisPanel>` side panel (rather than its current "select node" behavior).
2. Add a "Rescript for client…" action at the top of the panel — opens client picker, calls existing `/items/[id]/rescript` route.
3. Per-frame "use as thumbnail" action (existing `/items/[id]/thumbnail` route).
4. Comments thread at the bottom (existing `comments` API).

**Definition of done:** Click any video node → side panel slides in with all the existing analysis fields. Rescript flow works end-to-end against a real client.

### Phase 5 — Storage hygiene

1. Update `lib/search/topic-search-source-extract-frames.ts` (and the browser extractor, if it uploads) to write personal-board frames under `personal/{user_id}/{board_id}/{frame_uuid}.jpg`.
2. Backfill script for any existing personal-board items (none on day one — this is purely forward-looking).
3. Add `lifecycle` policy for the bucket if Supabase Storage supports it (defer to ops).

**Definition of done:** New personal-board frames land under the namespaced path. Old frames untouched.

### Phase 6 — Polish + cut

1. Personal board settings — rename, change cover, archive (soft delete via `archived_at`).
2. "What's this?" first-run tooltip on the paste bar.
3. Empty-state CTA: "Try pasting this example URL" with a curated TikTok.
4. Mobile read-only view (just disable drag, hide paste bar, render nodes as a vertical scroll list).

**Definition of done:** Ship to Vercel, swap the sidebar nav, send a "personal moodboards are live" note to the team.

## Open questions for Jack

1. **Where does the existing Presentations feature live in the sidebar?** Today "Notes" is its only entry point, and we're stealing the slot. Options: (a) move it under Manage as "Reports", (b) drop it from the sidebar and access via in-context buttons (e.g. "Generate report" inside a topic search), (c) kill it entirely. Default if you don't pick: (a) Reports under Manage.
2. **Does every user get a personal board, or admins-only first?** I assumed every user (admin + viewer) — viewers being clients with portal access. If portal viewers shouldn't have one yet, gate it on `role === 'admin'` in `getOrCreatePersonalBoard`.
3. **Multiple personal boards per user, or just one?** I assumed one. Multiple is a small lift if we want it (add a board picker dropdown above the canvas, reuse the existing boards CRUD).
4. **Drag-drop video files (not just URLs)?** Defer to v1.5 unless you want it on day one — it doubles the upload-pipeline scope.
5. **Realtime collab on personal boards** — explicitly out of scope for v1. Confirm.

Default behavior if unanswered: every admin gets exactly one personal board, named "My board", URL paste only, no drag-drop video files, no realtime. We can layer the rest after v1 ships.

## Risk register

| Risk | Mitigation |
|---|---|
| RLS rewrite breaks existing client moodboards. | Phase 1 migration explicitly preserves admin access for `is_personal=false` rows. Apply on a Supabase branch first if available; otherwise run on a slow window with an immediate rollback migration ready. |
| FFmpeg server-side extraction times out on long videos via Vercel Functions. | Cap input to 90s (TikTok / Reels / Shorts are all under that). Frame extraction at 3s intervals = ≤30 frames = fast. Function `maxDuration: 60`. |
| Apify cost from heavy URL pasting. | Per-user soft cap (e.g. 50 ingestions / day). Counter in `users.notification_preferences` JSONB or a new `usage` table — defer to v1.5. |
| Personal-board RLS bug leaks one user's board to another. | Three-layer defense: RLS policy + API-layer `requireBoardAccess` + integration test that asserts a non-owner gets 403. Never rely on a single layer. |

## Files that will change

```
NEW   supabase/migrations/102_personal_moodboards.sql
NEW   lib/moodboard/auth.ts
NEW   lib/moodboard/get-or-create-personal-board.ts
NEW   app/api/moodboard/personal/route.ts
NEW   app/admin/notes/page.tsx
NEW   components/notes/personal-moodboard.tsx
NEW   components/notes/paste-url-bar.tsx

EDIT  components/layout/admin-sidebar.tsx          (sidebar swap)
EDIT  app/api/analysis/boards/route.ts             (auth amendment)
EDIT  app/api/analysis/boards/[id]/route.ts        (auth amendment)
EDIT  app/api/analysis/boards/[id]/positions/route.ts (auth amendment)
EDIT  app/api/analysis/boards/[id]/duplicate/route.ts (auth amendment)
EDIT  app/api/analysis/items/route.ts              (auth amendment + return board)
EDIT  app/api/analysis/items/[id]/route.ts         (auth amendment)
EDIT  app/api/analysis/items/[id]/process/route.ts (auth amendment)
EDIT  app/api/analysis/items/[id]/transcribe/route.ts (auth amendment)
EDIT  app/api/analysis/items/[id]/analyze/route.ts (auth amendment)
EDIT  app/api/analysis/items/[id]/rescript/route.ts (auth amendment)
EDIT  app/api/analysis/items/[id]/extract-frames/route.ts (auth amendment)
EDIT  app/api/analysis/items/[id]/insights/route.ts (auth amendment)
EDIT  app/api/analysis/items/[id]/replicate/route.ts (auth amendment)
EDIT  app/api/analysis/items/[id]/video-url/route.ts (auth amendment)
EDIT  app/api/analysis/items/[id]/thumbnail/route.ts (auth amendment)
EDIT  app/api/analysis/notes/route.ts              (auth amendment)
EDIT  app/api/analysis/notes/[id]/route.ts         (auth amendment)
EDIT  app/api/analysis/comments/route.ts           (auth amendment)
EDIT  app/api/analysis/comments/[id]/route.ts      (auth amendment)
EDIT  app/api/analysis/edges/route.ts              (auth amendment)
EDIT  app/api/analysis/edges/[id]/route.ts         (auth amendment)
EDIT  lib/search/topic-search-source-extract-frames.ts (path namespace)
```

Total: 7 new files, ~22 edits, 1 migration. None large.

## SRL-ready

This spec is SRL-shaped: every phase has a clear definition of done that can be verified via a curl, a screenshot, or a test. Recommend SRL passes one phase per pass; six passes total.

After Jack answers the open questions, this spec is ready to feed into `/srl` directly.
