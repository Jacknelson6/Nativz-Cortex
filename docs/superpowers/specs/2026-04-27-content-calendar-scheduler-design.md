# Content Calendar Scheduler — Design Doc

**Date:** 2026-04-27
**Author:** Jack + Claude
**Status:** Approved, in implementation
**Spec ID:** content-calendar-scheduler

## 1. Goal (in one paragraph)

Replace Jack's manual content-calendar workflow (download Drive folder → upload to scheduler → pick days → watch each video → reference last week's captions → write caption → schedule on Zernio → send share link) with a single-screen flow: **paste a Google Drive folder URL, pick start + end dates, click Generate**. The system downloads each video, deeply analyses it via the Gemini File API, distributes the videos evenly across the date range, writes brand-voice-aligned captions that pass a quality rubric (length / CTA / niche hashtags), schedules each post via Zernio across all the client's connected platforms, and produces a public share link Jack can send the client for review and approval.

## 2. Decisions baked in (from clarification)

| # | Decision | Source |
|---|---|---|
| 1 | Schedule = even-distribute across user-supplied `start_date` and `end_date`. Default time of day = 10 AM brand-local. | Q1 |
| 2 | Video understanding uses **Gemini File API on raw bytes** (not frames). Required for motion + audio context. | Q2 |
| 3 | Caption style learned from saved captions **+ last 7 days of `scheduled_posts.caption` for that client**. Caption is graded against a rubric (body 100-200 chars, CTA on its own line, niche-aligned hashtags) and regenerated up to 3× until score ≥ 80. | Q3 |
| 4 | One share link per drop, with **per-video opt-in** (admin selects which posts to include in a given share link). Reuses existing `post_review_comments` for per-post approve / request-changes / comment. | Q4 |
| 5 | New page mounted at **`/admin/calendar`** for now (admin-only access; brand-pill scoped). Portal/viewer access is out of scope today. Future phase: portal read-only calendar view + viewer-can-edit-captions on share link. | Q5 |

## 3. Existing infrastructure being reused

| Component | Path | Use |
|---|---|---|
| Zernio publishPost | [lib/posting/zernio.ts](lib/posting/zernio.ts) | Schedule each post |
| `scheduled_posts` + `scheduled_post_platforms` | [supabase/migrations/011_create_scheduler_tables.sql](supabase/migrations/011_create_scheduler_tables.sql) | One row per post; multi-platform fan-out |
| Saved-caption AI route | [app/api/scheduler/ai/improve-caption/route.ts](app/api/scheduler/ai/improve-caption/route.ts) | Refactor & extend with rubric loop |
| Saved captions table | `saved_captions` (mig 011) | Style examples |
| Drive lib | [lib/google/drive.ts](lib/google/drive.ts) | List files + download |
| Storage buckets | `scheduler-media`, `scheduler-thumbnails` | Host downloaded videos |
| `post_review_links` + `post_review_comments` | mig 011 | Per-post comment / approve / changes-requested |
| `client_review_links` | mig 029 | Pattern for batch share token |
| Public share page UI | [app/shared/post/[token]/page.tsx](app/shared/post/[token]/page.tsx) | Pattern to mirror in batch view |
| Brand pill | [components/layout/admin-brand-pill.tsx](components/layout/admin-brand-pill.tsx) | Add green-dot indicator |
| Ideas hub design tokens | [components/ideas-hub/ideas-hub-view.tsx](components/ideas-hub/ideas-hub-view.tsx) | Visual reference |

## 4. Architecture overview

### 4.1 Data flow

```
Drive URL ─┐
            │   ┌─────────────────────────────┐
Start/End ─┼──▶│ POST /api/calendar/drops    │  creates content_drops row, status=ingesting
            │   └──────────┬──────────────────┘
                           │
                           ▼
            ┌──────────────────────────────────┐
            │ Drive listFiles → filter videos  │
            │ For each video (concurrency=3):  │
            │   • download bytes               │
            │   • upload to scheduler-media    │
            │   • generate thumbnail (ffmpeg)  │
            │   • Gemini File API: upload +    │
            │     prompt for context summary   │
            │   • write content_drop_videos    │
            └──────────┬───────────────────────┘
                       │  status=analyzing
                       ▼
            ┌──────────────────────────────────┐
            │ For each video:                  │
            │   • generateCaption(             │
            │       brandVoice, savedCaptions, │
            │       last7DaysCaptions,         │
            │       geminiContext)             │
            │   • gradeCaption() → score       │
            │   • iterate up to 3× if < 80     │
            │ Distribute slots evenly between  │
            │ start/end dates @ default time   │
            │ Create scheduled_posts (draft)   │
            └──────────┬───────────────────────┘
                       │  status=ready
                       ▼
            ┌──────────────────────────────────┐
            │ Admin reviews on /admin/calendar │
            │ (edits captions / dates as needed)
            │ Clicks "Schedule"                │
            │   → publishPost(scheduleAt)      │
            │   → status=scheduled             │
            │ Clicks "Create share link"       │
            │   → picks posts, generates token │
            └──────────┬───────────────────────┘
                       │
                       ▼
            ┌──────────────────────────────────┐
            │ Client opens /share/calendar/[t] │
            │ Watches each video inline,       │
            │ leaves comments / approves /     │
            │ requests changes per post        │
            └──────────────────────────────────┘
```

### 4.2 New tables

```sql
-- Migration 175_create_content_drops.sql

CREATE TABLE content_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  drive_folder_url TEXT NOT NULL,
  drive_folder_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ingesting'
    CHECK (status IN ('ingesting', 'analyzing', 'generating', 'ready', 'scheduled', 'failed')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  default_post_time TIME NOT NULL DEFAULT '10:00',
  total_videos INTEGER NOT NULL DEFAULT 0,
  processed_videos INTEGER NOT NULL DEFAULT 0,
  error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_content_drops_client_status ON content_drops(client_id, status);
CREATE INDEX idx_content_drops_created_at ON content_drops(created_at DESC);

CREATE TABLE content_drop_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id UUID NOT NULL REFERENCES content_drops(id) ON DELETE CASCADE,
  scheduled_post_id UUID REFERENCES scheduled_posts(id) ON DELETE SET NULL,
  drive_file_id TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  video_url TEXT,            -- Supabase Storage public URL
  thumbnail_url TEXT,
  duration_seconds NUMERIC,
  size_bytes BIGINT,
  mime_type TEXT,
  gemini_file_uri TEXT,      -- gs:// URI returned by Gemini File API
  gemini_context JSONB,      -- structured context (theme, hook, mood, audio, key_visuals[])
  caption_score INTEGER,     -- 0-100 from rubric
  caption_iterations INTEGER DEFAULT 0,
  order_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'downloading', 'analyzing', 'caption_pending', 'ready', 'failed')),
  error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_drop_videos_drop ON content_drop_videos(drop_id, order_index);
CREATE INDEX idx_drop_videos_post ON content_drop_videos(scheduled_post_id);

CREATE TABLE content_drop_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id UUID NOT NULL REFERENCES content_drops(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  included_post_ids UUID[] NOT NULL DEFAULT '{}',
  -- Maps included scheduled_post_id → post_review_links.id so we can reuse
  -- the existing post_review_comments table without a schema change.
  post_review_link_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_viewed_at TIMESTAMPTZ
);

CREATE INDEX idx_drop_share_links_token ON content_drop_share_links(token);
CREATE INDEX idx_drop_share_links_drop ON content_drop_share_links(drop_id);

-- RLS
ALTER TABLE content_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_drop_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_drop_share_links ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_all_drops" ON content_drops FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
CREATE POLICY "admin_all_drop_videos" ON content_drop_videos FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
CREATE POLICY "admin_all_share_links" ON content_drop_share_links FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

-- Anonymous read of share link by token (for public review page)
CREATE POLICY "anon_read_share_by_token" ON content_drop_share_links FOR SELECT
  TO anon USING (expires_at > now());
```

### 4.3 New API routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/calendar/drops` | Create drop (Drive URL + dates), kicks off background ingestion |
| GET | `/api/calendar/drops` | List drops for active client |
| GET | `/api/calendar/drops/[id]` | Drop detail (videos + status) |
| POST | `/api/calendar/drops/[id]/process` | Internal: runs ingestion + analysis (called from server, can be retried) |
| POST | `/api/calendar/drops/[id]/regenerate-caption` | Regenerate caption for a single video |
| PATCH | `/api/calendar/drops/[id]/videos/[videoId]` | Update caption / scheduled_at / hashtags / platform selection on a video |
| POST | `/api/calendar/drops/[id]/schedule` | Push all `ready` videos to Zernio (creates scheduled_posts, calls publishPost with scheduleAt) |
| POST | `/api/calendar/drops/[id]/share-links` | Create a share link with a list of post_ids |
| GET | `/api/calendar/share/[token]` | Public: fetch share link + video manifest (no auth) |
| POST | `/api/calendar/share/[token]/comment` | Public: leave comment / approval / changes-requested on a post |
| GET | `/api/calendar/scheduled-summary` | Returns per-client count of posts scheduled in next 7 days (for green dot) |

## 5. Caption generation + rubric

### 5.1 Prompt inputs

```ts
type CaptionInputs = {
  brandVoice: string;             // clients.brand_voice
  targetAudience: string;         // clients.target_audience
  services: string[];             // clients.services
  savedCaptions: SavedCaption[];  // saved_captions for this client
  recentCaptions: string[];       // last 7 days of scheduled_posts.caption for this client
  videoContext: GeminiContext;    // structured output from Gemini File API
};
```

### 5.2 Gemini context structure

The Gemini File API call asks for JSON with this schema:

```ts
type GeminiContext = {
  one_liner: string;              // "Trainer demos a kettlebell flow with 4 beats"
  hook_seconds_0_3: string;       // What's literally happening in seconds 0-3
  visual_themes: string[];        // ["gym", "kettlebells", "neon lighting"]
  audio_summary: string;          // "Upbeat hip hop, no voiceover, gym ambient"
  spoken_text_summary: string;    // VO/dialogue summary, "" if none
  mood: string;                   // "energetic", "calm", "playful", etc
  pacing: 'slow' | 'medium' | 'fast';
  recommended_caption_angle: string; // "lead with the unusual exercise"
  key_moments: { t: number; description: string }[];
};
```

### 5.3 Grading rubric

```ts
function gradeCaption(text: string, hashtags: string[], niche: string[]): {
  total: number;          // 0-100
  body_length: number;    // 0-30
  cta_separation: number; // 0-30
  hashtag_relevance: number; // 0-25
  voice_match: number;    // 0-15
  reasons: string[];      // human-readable, fed back to LLM on retry
}
```

Components:

- **body_length** (max 30): chars of body excluding the CTA line and hashtag block. 100-200 = 30; 80-99 or 201-220 = 22; 60-79 or 221-260 = 14; outside = 5.
- **cta_separation** (max 30): regex matches a CTA on its own line ("Follow for…", "Save this for…", "Comment X if…", "Tag a friend who…", "Try this and…"). Own line + recognized verb = 30; embedded with verb = 18; missing = 0.
- **hashtag_relevance** (max 25): % of hashtags that appear in the client's `saved_captions.hashtags` union or topic_keywords. 80%+ = 25; 50-79% = 18; 20-49% = 10; <20% = 3.
- **voice_match** (max 15): LLM-self-rated 1-10 against `brand_voice` examples, normalized to 15.

If `total < 80` and iterations < 3, regenerate with `reasons` injected as guidance. If still < 80 after 3 iterations, ship the highest-scoring attempt and surface the score in the UI so Jack can hand-edit.

## 6. Even-distribution algorithm

```ts
function distributeSlots(
  videoCount: number,
  startDate: Date,
  endDate: Date,
  defaultTime: string  // "10:00"
): Date[] {
  const totalDays = Math.max(1, daysBetween(startDate, endDate));
  if (videoCount === 1) return [combineDateTime(startDate, defaultTime)];
  const interval = totalDays / (videoCount - 1);
  return Array.from({ length: videoCount }, (_, i) =>
    combineDateTime(addDays(startDate, Math.round(i * interval)), defaultTime)
  );
}
```

This produces:
- 10 videos over 4 weeks (28 days) → roughly every 3 days
- 16 videos over 4 weeks → roughly every 1.8 days
- Edge: if any two slots collide on the same day, bump the later one by `defaultTime + 4h` to avoid double-posts.

The schedule is **editable per slot** in the admin UI before clicking "Schedule".

## 7. Phases

Each phase ends with an explicit verification gate. No phase ships without all gates green.

### Phase 0 — Skeleton + DB
- Migration `175_create_content_drops.sql` (the SQL in §4.2)
- Empty admin page at [app/admin/calendar/page.tsx](app/admin/calendar/page.tsx) with Ideas Hub design tokens
- Sidebar nav entry `Calendar` (Title Case, under Create section)
- Type definitions in [lib/types/calendar.ts](lib/types/calendar.ts)
- **Gate:** `npm run build` clean, `npx tsc --noEmit` clean, page renders empty state

### Phase 1 — Drive ingestion
- `POST /api/calendar/drops` validates Drive URL, extracts folder ID, lists files, filters by MIME (`video/*`), creates `content_drops` + `content_drop_videos` rows
- Background processor `lib/calendar/ingest-drop.ts`:
  - Per video: `downloadFile()` → upload to `scheduler-media` bucket → write `video_url` to row → status `analyzing`
  - Concurrency = 3
  - Generates thumbnail with ffmpeg via `lib/calendar/thumbnail.ts` (extract frame at 1s, upload to `scheduler-thumbnails`)
- **Gate:** drop a Drive folder of 5 sample videos, all 5 land in `content_drop_videos` with `video_url` + `thumbnail_url`, status `analyzing`, total runtime < 90s

### Phase 2 — Gemini File API video analysis
- `lib/gemini/file-api.ts` — uploads bytes via Gemini File API (`/v1beta/files`), returns `{ uri, name }`
- `lib/calendar/analyze-video.ts` — calls Gemini 2.5 Flash with the file_data ref, structured-output prompt requesting the §5.2 schema; writes `gemini_context` and `gemini_file_uri`; status `caption_pending`
- Uses `GOOGLE_AI_STUDIO_API_KEY` from existing memory
- Retry once on rate limit; surface failure in `error_detail`
- **Gate:** all 5 videos from phase 1 have non-null `gemini_context` with all required keys; sample one video's context in chat for sanity check

### Phase 3 — Caption generation + rubric loop
- Refactor [app/api/scheduler/ai/improve-caption/route.ts](app/api/scheduler/ai/improve-caption/route.ts) into `lib/calendar/generate-caption.ts` (pure function, can also be called from the existing route)
- Implement `lib/calendar/grade-caption.ts` with the §5.3 rubric
- Loop: generate → grade → if score < 80 and iter < 3, regenerate with reasons injected; persist final caption + `caption_score` + `caption_iterations` on `content_drop_videos`
- **Gate:** all 5 videos have captions with `caption_score >= 80` OR clearly visible warning in admin UI; bodies are 100-200 chars; hashtags pulled from saved-captions pool; CTAs on their own line

### Phase 4 — Schedule + Zernio fan-out
- `lib/calendar/distribute-slots.ts` (the §6 algorithm)
- `POST /api/calendar/drops/[id]/schedule`:
  - For each `ready` video: create `scheduled_posts` row with `client_id`, `caption`, `hashtags`, `cover_image_url`, `scheduled_at`, `post_type='reel'`
  - Look up client's `social_profiles` (active ones) → call `publishPost()` from `lib/posting/zernio.ts` with `scheduledAt` and `platformProfileIds`
  - Wire `scheduled_post_id` back onto `content_drop_videos`
  - Mark drop status `scheduled`
- **Gate:** click Schedule on a drop, all rows show up in `scheduled_posts` with `late_post_id`, Zernio dashboard shows the scheduled posts for the matching dates

### Phase 5 — Admin Calendar page
- [app/admin/calendar/page.tsx](app/admin/calendar/page.tsx) — drops list + create-drop modal (Drive URL, start date, end date)
- [app/admin/calendar/[dropId]/page.tsx](app/admin/calendar/[dropId]/page.tsx) — drop detail:
  - Header: client name, dates, status pill, video count, "Regenerate all captions" / "Schedule all" / "Create share link" buttons
  - Video grid: each row shows thumbnail + 9:16 inline preview + caption (editable in place) + hashtags (chips, editable) + scheduled-at picker + caption score badge + per-video "Regenerate caption" + per-video selectable for share link
  - Live progress while ingesting/analyzing (poll `GET /api/calendar/drops/[id]` every 3s while not in terminal status)
- Visual reference: ideas hub. Dark theme, `bg-surface` cards on `bg-background`, `accent2-text` for primary actions, `border-nativz-border`
- **Gate:** flow works end-to-end in browser: drop a folder → page polls → previews render → captions show → editable → schedule clicked → all green; visual diff against ideas-hub feels native

### Phase 6 — Public batch share link
- `POST /api/calendar/drops/[id]/share-links` — creates token + `included_post_ids`. **Also creates one `post_review_links` row per included post** and stores the map on `post_review_link_map` so the existing `post_review_comments` table can be reused without schema changes. Returns the public URL.
- [app/share/calendar/[token]/page.tsx](app/share/calendar/[token]/page.tsx) — public, no auth:
  - Hero: client name, "Content calendar from Nativz", drop date range
  - Vertical stack of cards, one per included post:
    - Inline `<video>` player (9:16, controls, autoplay=false, preload=metadata)
    - Scheduled date + platform pills
    - Caption text
    - Hashtag chips
    - Comment composer + Approve / Request changes / Comment buttons (reusing `post_review_comments`)
    - Existing comments below
  - Footer: client name input persists in localStorage so they don't re-type
- Reuse the styling from [app/shared/post/[token]/page.tsx](app/shared/post/[token]/page.tsx)
- **Gate:** open the share link in an incognito window, watch all 5 videos inline, leave a comment, mark one approved, mark one changes-requested. Comments appear in admin UI on next refresh.

### Phase 7 — Brand-pill green-dot indicator
- `GET /api/calendar/scheduled-summary` returns `{ [clientId]: count }` for posts where `scheduled_at` is in next 7 days
- [components/layout/admin-brand-pill.tsx](components/layout/admin-brand-pill.tsx): fetch on mount + every 60s; render a 6×6 emerald dot next to brands with count > 0; tooltip shows "N posts scheduled this week"
- **Gate:** brand with scheduled drop shows green dot; clearing the drop removes the dot within 60s

### Phase 8 — Polish + sanity sweep
- Run `npm run lint`, `npx tsc --noEmit`, `npm run build`
- Visual QA against Ideas Hub: spacing, card density, typography sizes, button styles, loading skeletons, empty states
- Verify: caption sentence-case (NOT title case), buttons don't wrap, sidebar uses Title Case for "Calendar", rest of page uses sentence case
- E2E: full flow through Playwright using `scripts/magic-link.ts` for auth (per memory)
- **Gate:** lint/types/build all clean; share link looks polished and brand-consistent; admin page indistinguishable in visual quality from ideas hub

## 8. Out of scope today (future phases)

- Portal `/portal/calendar` read-only view
- Letting client edit captions on share link
- Pulling organic (non-ours) captions from Zernio's connected-account API
- Per-platform caption variants (single caption used for all platforms today)
- Re-running analysis on a drop (today: failed videos surface error and admin can retry that one)
- Slack/email notification on share-link comment

## 9. Risks

| Risk | Mitigation |
|---|---|
| Gemini File API quota / rate limits during a 20-video drop | Concurrency=3, retry once on 429, fall back to next-frame-only analysis path with a clear flag in `gemini_context.degraded=true` |
| Drive folder very large (>2GB total) | Reject folders >2GB at ingest with a clear error; document the limit |
| FFmpeg not on Vercel runtime | Use `@ffmpeg-installer/ffmpeg` package (works on Vercel Functions) — same pattern as moodboard if it already uses it; otherwise generate thumbnail via Gemini frame extraction prompt |
| Scheduling collision on same minute | Distribute algorithm bumps later collisions by 4h; show conflicts in UI before user clicks Schedule |
| Caption rubric scores low for niche clients (insufficient saved captions) | Fall through to brand-voice-only generation if `saved_captions.length === 0`; surface a "configure saved captions to improve quality" hint |

## 10. Verification checklist (before reporting "ready to test")

- [ ] `npm run build` — clean
- [ ] `npx tsc --noEmit` — clean
- [ ] `npm run lint` — clean
- [ ] Migration applied locally
- [ ] Drop a real Drive folder of ≥3 videos end-to-end
- [ ] All videos have captions ≥80 score
- [ ] Schedule pushed to Zernio successfully (verify `late_post_id` populated)
- [ ] Share link works in incognito
- [ ] Comment posted from share link appears in admin
- [ ] Green dot appears on brand pill for scheduled brand
- [ ] Sidebar nav entry "Calendar" present, sentence-case rest of UI
- [ ] Visual diff vs ideas hub: indistinguishable density/spacing/typography
