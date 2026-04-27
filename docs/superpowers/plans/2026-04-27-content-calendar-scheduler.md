# Content Calendar Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Jack's manual content-calendar workflow with a paste-Drive-folder → AI-analyse → AI-caption → schedule-on-Zernio → public-share-link flow.

**Architecture:** New admin page at `/admin/calendar` that orchestrates a `content_drops` entity. Each drop downloads videos from Google Drive, analyses them via Gemini File API, generates rubric-graded captions, distributes slots evenly across user-supplied date range, schedules posts via existing Zernio integration, and produces a public batch share link with per-post comment / approve / changes-requested.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + Storage), Google Drive API (existing OAuth), Gemini 2.5 Flash File API, Zernio (existing), `fluent-ffmpeg` + `ffmpeg-static`, OpenRouter for caption generation, Tailwind v4.

**Spec:** [docs/superpowers/specs/2026-04-27-content-calendar-scheduler-design.md](../specs/2026-04-27-content-calendar-scheduler-design.md)

**Env vars used:** `GOOGLE_AI_STUDIO_KEY` (Gemini), `OPENROUTER_API_KEY` (existing), `ZERNIO_API_KEY` (existing), Google Drive OAuth (existing).

---

## File map

### New files (created by this plan)
```
supabase/migrations/175_create_content_drops.sql
lib/types/calendar.ts
lib/calendar/distribute-slots.ts
lib/calendar/__tests__/distribute-slots.test.ts
lib/calendar/grade-caption.ts
lib/calendar/__tests__/grade-caption.test.ts
lib/calendar/generate-caption.ts
lib/calendar/drive-folder.ts
lib/calendar/storage-upload.ts
lib/calendar/thumbnail.ts
lib/calendar/ingest-drop.ts
lib/calendar/analyze-video.ts
lib/calendar/schedule-drop.ts
lib/gemini/file-api.ts
app/api/calendar/drops/route.ts
app/api/calendar/drops/[id]/route.ts
app/api/calendar/drops/[id]/process/route.ts
app/api/calendar/drops/[id]/schedule/route.ts
app/api/calendar/drops/[id]/share-links/route.ts
app/api/calendar/drops/[id]/videos/[videoId]/route.ts
app/api/calendar/drops/[id]/videos/[videoId]/regenerate-caption/route.ts
app/api/calendar/share/[token]/route.ts
app/api/calendar/share/[token]/comment/route.ts
app/api/calendar/scheduled-summary/route.ts
app/admin/calendar/page.tsx
app/admin/calendar/[dropId]/page.tsx
app/share/calendar/[token]/page.tsx
components/calendar/create-drop-modal.tsx
components/calendar/drops-list.tsx
components/calendar/drop-detail-view.tsx
components/calendar/video-card.tsx
components/calendar/share-link-modal.tsx
components/calendar/share-link-card.tsx
```

### Modified files
```
components/layout/admin-sidebar.tsx               (add Calendar nav entry)
components/layout/admin-brand-pill.tsx            (add green-dot indicator)
```

---

## Phase 0 — Skeleton + DB

### Task 0.1: Create migration file

**Files:**
- Create: `supabase/migrations/175_create_content_drops.sql`

- [ ] **Step 1:** Write the SQL exactly as specified in §4.2 of the spec. Save to `supabase/migrations/175_create_content_drops.sql`. Include the `post_review_link_map JSONB` column on `content_drop_share_links`.

- [ ] **Step 2:** Apply the migration via Supabase MCP:
```
mcp__supabase__apply_migration({ name: "175_create_content_drops", query: <SQL contents> })
```
Verify with `mcp__supabase__list_tables` that `content_drops`, `content_drop_videos`, `content_drop_share_links` are present.

- [ ] **Step 3:** Commit
```bash
git add supabase/migrations/175_create_content_drops.sql
git commit -m "feat(calendar): db schema for content drops"
```

### Task 0.2: TypeScript types

**Files:**
- Create: `lib/types/calendar.ts`

- [ ] **Step 1:** Write all shared types:

```ts
// lib/types/calendar.ts

export type DropStatus = 'ingesting' | 'analyzing' | 'generating' | 'ready' | 'scheduled' | 'failed';
export type DropVideoStatus = 'pending' | 'downloading' | 'analyzing' | 'caption_pending' | 'ready' | 'failed';

export interface ContentDrop {
  id: string;
  client_id: string;
  created_by: string;
  drive_folder_url: string;
  drive_folder_id: string;
  status: DropStatus;
  start_date: string;     // YYYY-MM-DD
  end_date: string;
  default_post_time: string; // HH:MM
  total_videos: number;
  processed_videos: number;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeminiContext {
  one_liner: string;
  hook_seconds_0_3: string;
  visual_themes: string[];
  audio_summary: string;
  spoken_text_summary: string;
  mood: string;
  pacing: 'slow' | 'medium' | 'fast';
  recommended_caption_angle: string;
  key_moments: { t: number; description: string }[];
  degraded?: boolean;
}

export interface ContentDropVideo {
  id: string;
  drop_id: string;
  scheduled_post_id: string | null;
  drive_file_id: string;
  drive_file_name: string;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  gemini_file_uri: string | null;
  gemini_context: GeminiContext | null;
  caption_score: number | null;
  caption_iterations: number;
  order_index: number;
  status: DropVideoStatus;
  error_detail: string | null;
  created_at: string;
}

export interface ContentDropShareLink {
  id: string;
  drop_id: string;
  token: string;
  included_post_ids: string[];
  post_review_link_map: Record<string, string>;
  expires_at: string;
  created_at: string;
  last_viewed_at: string | null;
}

export interface CaptionGrade {
  total: number;            // 0-100
  body_length: number;      // 0-30
  cta_separation: number;   // 0-30
  hashtag_relevance: number;// 0-25
  voice_match: number;      // 0-15
  reasons: string[];
}
```

- [ ] **Step 2:** Verify `npx tsc --noEmit` runs clean.

- [ ] **Step 3:** Commit
```bash
git add lib/types/calendar.ts
git commit -m "feat(calendar): typescript types"
```

### Task 0.3: Sidebar nav entry

**Files:**
- Modify: `components/layout/admin-sidebar.tsx`

- [ ] **Step 1:** Read the file. Find the section that maps "Create" group nav entries (Trend Finder, etc.). Add a new entry:

```tsx
{ href: '/admin/calendar', label: 'Calendar', icon: CalendarDays }
```

Use Title Case for label per `feedback_sidebar_title_case` memory. Pick `CalendarDays` from `lucide-react`.

- [ ] **Step 2:** Verify the import for `CalendarDays` is added at the top.

- [ ] **Step 3:** Visual: run `npm run dev` in background, open `http://localhost:3001/admin`, confirm Calendar appears in sidebar.

- [ ] **Step 4:** Commit
```bash
git add components/layout/admin-sidebar.tsx
git commit -m "feat(calendar): sidebar nav entry"
```

### Task 0.4: Empty admin page with brand-pill scoping

**Files:**
- Create: `app/admin/calendar/page.tsx`

- [ ] **Step 1:** Write the empty page. Use Ideas Hub design tokens (`bg-surface`, `border-nativz-border`, `accent2-text`, `text-text-primary`, `text-text-secondary`):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useBrand } from '@/lib/brand/use-brand';
import { CalendarDays } from 'lucide-react';

export default function CalendarPage() {
  const { brand } = useBrand();
  const [drops, setDrops] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!brand?.id) return;
    setLoading(true);
    fetch(`/api/calendar/drops?clientId=${brand.id}`)
      .then((r) => r.json())
      .then((data) => setDrops(data.drops ?? []))
      .finally(() => setLoading(false));
  }, [brand?.id]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Content calendar</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Drop a Drive folder, get scheduled posts and a client share link.
          </p>
        </div>
      </header>

      {!brand && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">Pick a brand from the sidebar to get started.</p>
        </div>
      )}

      {brand && loading && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center text-sm text-text-secondary">
          Loading drops…
        </div>
      )}

      {brand && !loading && drops.length === 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">No drops yet for {brand.name}.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2:** Use the existing `useBrand` hook (search for it: `grep -r "export.*useBrand" lib/`). If the hook is at a different path, adjust the import.

- [ ] **Step 3:** Add a thin GET stub to `/api/calendar/drops` so the fetch doesn't 404:

Create `app/api/calendar/drops/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ drops: [] });

  const { data, error } = await supabase
    .from('content_drops')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drops: data ?? [] });
}
```

- [ ] **Step 4:** Verify `npx tsc --noEmit` clean. Run `npm run dev`, visit `/admin/calendar`, confirm the empty state renders.

- [ ] **Step 5:** Commit
```bash
git add app/admin/calendar/page.tsx app/api/calendar/drops/route.ts
git commit -m "feat(calendar): admin page skeleton + drops list endpoint"
```

### Phase 0 verification gate

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean (in calendar files only)
- [ ] `/admin/calendar` page renders empty state
- [ ] Sidebar shows Calendar entry
- [ ] DB: `mcp__supabase__list_tables` shows `content_drops`, `content_drop_videos`, `content_drop_share_links`

---

## Phase 1 — Drive ingestion

### Task 1.1: Drive folder helper

**Files:**
- Create: `lib/calendar/drive-folder.ts`

- [ ] **Step 1:** Write the helper. Reuses `lib/google/drive.ts` for the API plumbing:

```ts
// lib/calendar/drive-folder.ts
import { listFiles } from '@/lib/google/drive';

const VIDEO_MIME_PREFIXES = ['video/'];
const DRIVE_FOLDER_REGEX = /\/folders\/([a-zA-Z0-9_-]+)/;

export function extractFolderId(url: string): string | null {
  const m = url.match(DRIVE_FOLDER_REGEX);
  return m?.[1] ?? null;
}

export interface DriveVideoFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export async function listVideosInFolder(userId: string, folderId: string): Promise<DriveVideoFile[]> {
  const all: DriveVideoFile[] = [];
  let pageToken: string | undefined;

  do {
    const page = await listFiles(userId, { folderId, pageSize: 100, pageToken });
    for (const f of page.files) {
      if (VIDEO_MIME_PREFIXES.some((p) => f.mimeType.startsWith(p))) {
        all.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: Number(f.size ?? '0'),
        });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  // sort by name so admin sees them in folder-natural order
  all.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }));
  return all;
}
```

- [ ] **Step 2:** Verify `npx tsc --noEmit` clean.

- [ ] **Step 3:** Commit
```bash
git add lib/calendar/drive-folder.ts
git commit -m "feat(calendar): drive folder listing"
```

### Task 1.2: Storage upload helper

**Files:**
- Create: `lib/calendar/storage-upload.ts`

- [ ] **Step 1:** Write the helper:

```ts
// lib/calendar/storage-upload.ts
import { createAdminClient } from '@/lib/supabase/admin';

export async function uploadVideoToStorage(args: {
  dropId: string;
  videoId: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<string> {
  const supabase = createAdminClient();
  const ext = args.fileName.split('.').pop() || 'mp4';
  const path = `drops/${args.dropId}/${args.videoId}.${ext}`;

  const { error } = await supabase.storage
    .from('scheduler-media')
    .upload(path, args.buffer, {
      contentType: args.mimeType,
      upsert: true,
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from('scheduler-media').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadThumbnailToStorage(args: {
  dropId: string;
  videoId: string;
  buffer: Buffer;
}): Promise<string> {
  const supabase = createAdminClient();
  const path = `drops/${args.dropId}/${args.videoId}.jpg`;
  const { error } = await supabase.storage
    .from('scheduler-thumbnails')
    .upload(path, args.buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Thumbnail upload failed: ${error.message}`);
  const { data } = supabase.storage.from('scheduler-thumbnails').getPublicUrl(path);
  return data.publicUrl;
}
```

- [ ] **Step 2:** Verify the import path for `createAdminClient` (search for it). Adjust if needed.

- [ ] **Step 3:** Commit
```bash
git add lib/calendar/storage-upload.ts
git commit -m "feat(calendar): supabase storage upload helpers"
```

### Task 1.3: Thumbnail extractor

**Files:**
- Create: `lib/calendar/thumbnail.ts`

- [ ] **Step 1:** Use the same ffmpeg pattern as `lib/search/topic-search-source-extract-frames.ts`:

```ts
// lib/calendar/thumbnail.ts
import Ffmpeg from 'fluent-ffmpeg';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string | null = require('ffmpeg-static');
if (ffmpegPath) Ffmpeg.setFfmpegPath(ffmpegPath);

export async function extractThumbnail(videoBuffer: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const dir = join(tmpdir(), `nz-thumb-${id}`);
  await mkdir(dir, { recursive: true });
  const inPath = join(dir, 'in.mp4');
  const outPath = join(dir, 'out.jpg');
  await writeFile(inPath, videoBuffer);

  await new Promise<void>((resolve, reject) => {
    Ffmpeg(inPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .screenshots({
        timestamps: ['00:00:01.000'],
        filename: 'out.jpg',
        folder: dir,
        size: '720x?',
      });
  });

  const out = await readFile(outPath);
  await unlink(inPath).catch(() => {});
  await unlink(outPath).catch(() => {});
  return out;
}
```

- [ ] **Step 2:** Commit
```bash
git add lib/calendar/thumbnail.ts
git commit -m "feat(calendar): video thumbnail extraction"
```

### Task 1.4: Drop creation API + ingest orchestrator

**Files:**
- Create: `lib/calendar/ingest-drop.ts`
- Modify: `app/api/calendar/drops/route.ts` (add POST)
- Create: `app/api/calendar/drops/[id]/process/route.ts`

- [ ] **Step 1:** Add POST to `app/api/calendar/drops/route.ts`:

```ts
import { z } from 'zod';

const createDropSchema = z.object({
  clientId: z.string().uuid(),
  driveFolderUrl: z.string().url(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  defaultPostTime: z.string().regex(/^\d{2}:\d{2}$/).default('10:00'),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = createDropSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { extractFolderId } = await import('@/lib/calendar/drive-folder');
  const folderId = extractFolderId(parsed.data.driveFolderUrl);
  if (!folderId) return NextResponse.json({ error: 'Invalid Drive folder URL' }, { status: 400 });

  const { data: drop, error } = await supabase
    .from('content_drops')
    .insert({
      client_id: parsed.data.clientId,
      created_by: user.id,
      drive_folder_url: parsed.data.driveFolderUrl,
      drive_folder_id: folderId,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      default_post_time: parsed.data.defaultPostTime,
      status: 'ingesting',
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire-and-forget the processor
  const origin = req.headers.get('origin') || `http://localhost:${process.env.PORT || 3001}`;
  fetch(`${origin}/api/calendar/drops/${drop.id}/process`, {
    method: 'POST',
    headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || 'dev', cookie: req.headers.get('cookie') || '' },
  }).catch(() => {});

  return NextResponse.json({ drop });
}
```

- [ ] **Step 2:** Write `lib/calendar/ingest-drop.ts`:

```ts
// lib/calendar/ingest-drop.ts
import { createAdminClient } from '@/lib/supabase/admin';
import { listVideosInFolder } from './drive-folder';
import { downloadFile } from '@/lib/google/drive';
import { uploadVideoToStorage, uploadThumbnailToStorage } from './storage-upload';
import { extractThumbnail } from './thumbnail';

export async function ingestDrop(dropId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: drop } = await supabase
    .from('content_drops')
    .select('*')
    .eq('id', dropId)
    .single();
  if (!drop) throw new Error('Drop not found');

  // 1. List videos in folder (uses creator's Drive token)
  const videos = await listVideosInFolder(drop.created_by, drop.drive_folder_id);

  await supabase
    .from('content_drops')
    .update({ total_videos: videos.length })
    .eq('id', dropId);

  // 2. Insert one row per video
  const rows = videos.map((v, i) => ({
    drop_id: dropId,
    drive_file_id: v.id,
    drive_file_name: v.name,
    size_bytes: v.size,
    mime_type: v.mimeType,
    order_index: i,
    status: 'pending' as const,
  }));
  const { data: inserted } = await supabase
    .from('content_drop_videos')
    .insert(rows)
    .select();
  if (!inserted) throw new Error('Failed to insert video rows');

  // 3. Download + thumbnail with concurrency=3
  const queue = [...inserted];
  let processed = 0;
  const worker = async () => {
    while (queue.length) {
      const v = queue.shift();
      if (!v) break;
      try {
        await supabase.from('content_drop_videos').update({ status: 'downloading' }).eq('id', v.id);
        const { buffer, mimeType } = await downloadFile(drop.created_by, v.drive_file_id);
        const videoUrl = await uploadVideoToStorage({
          dropId, videoId: v.id, buffer, mimeType, fileName: v.drive_file_name,
        });
        let thumbnailUrl: string | null = null;
        try {
          const thumb = await extractThumbnail(buffer);
          thumbnailUrl = await uploadThumbnailToStorage({ dropId, videoId: v.id, buffer: thumb });
        } catch (err) {
          console.warn(`[ingest] Thumbnail failed for ${v.id}:`, err);
        }
        await supabase
          .from('content_drop_videos')
          .update({ video_url: videoUrl, thumbnail_url: thumbnailUrl, status: 'analyzing' })
          .eq('id', v.id);
      } catch (err) {
        await supabase
          .from('content_drop_videos')
          .update({ status: 'failed', error_detail: err instanceof Error ? err.message : String(err) })
          .eq('id', v.id);
      } finally {
        processed += 1;
        await supabase.from('content_drops').update({ processed_videos: processed }).eq('id', dropId);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  await supabase.from('content_drops').update({ status: 'analyzing' }).eq('id', dropId);
}
```

- [ ] **Step 3:** Write `app/api/calendar/drops/[id]/process/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ingestDrop } from '@/lib/calendar/ingest-drop';

export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    await ingestDrop(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4:** Add GET to `app/api/calendar/drops/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: drop } = await supabase.from('content_drops').select('*').eq('id', id).single();
  if (!drop) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: videos } = await supabase
    .from('content_drop_videos')
    .select('*')
    .eq('drop_id', id)
    .order('order_index');

  return NextResponse.json({ drop, videos: videos ?? [] });
}
```

- [ ] **Step 5:** Verify `npx tsc --noEmit` clean.

- [ ] **Step 6:** Commit
```bash
git add lib/calendar/ingest-drop.ts app/api/calendar/drops/route.ts app/api/calendar/drops/[id]/route.ts app/api/calendar/drops/[id]/process/route.ts
git commit -m "feat(calendar): drop creation + drive ingestion orchestrator"
```

### Task 1.5: Manual smoke test of ingestion

- [ ] **Step 1:** Start dev: `npm run dev`. Wait for "Ready in".

- [ ] **Step 2:** Use the app or curl to POST a drop:
```bash
curl -X POST http://localhost:3001/api/calendar/drops \
  -H 'Content-Type: application/json' \
  -H "cookie: <copy from browser session>" \
  -d '{"clientId":"<test client uuid>","driveFolderUrl":"<test drive folder url>","startDate":"2026-05-01","endDate":"2026-05-15"}'
```

- [ ] **Step 3:** Tail Vercel/dev console. Within ~90s, confirm:
  - `content_drops.status` → `analyzing`
  - `content_drop_videos` rows have non-null `video_url` and `thumbnail_url`
  - Test one of the public URLs in browser — video loads

If a video fails to download or thumbnail, debug. If Drive auth fails, ensure Jack's Google account is connected in the existing OAuth UI.

### Phase 1 verification gate

- [ ] Drop a real Drive folder → all videos land in storage with public URLs and thumbnails
- [ ] `total_videos` and `processed_videos` are correct
- [ ] `npx tsc --noEmit` clean
- [ ] Status flows: ingesting → analyzing

---

## Phase 2 — Gemini File API video analysis

### Task 2.1: Gemini File API client

**Files:**
- Create: `lib/gemini/file-api.ts`

- [ ] **Step 1:** Use Gemini's resumable upload protocol. Reference: https://ai.google.dev/gemini-api/docs/files (executor: open this with WebFetch / context7 to confirm exact endpoint shape before writing).

```ts
// lib/gemini/file-api.ts

const GEMINI_API_KEY = process.env.GOOGLE_AI_STUDIO_KEY;
const BASE = 'https://generativelanguage.googleapis.com';

if (!GEMINI_API_KEY) {
  console.warn('[gemini] GOOGLE_AI_STUDIO_KEY not set — Gemini File API calls will fail');
}

export interface UploadedGeminiFile {
  uri: string;        // gs:// URI for use in generateContent
  name: string;       // files/abc123
  mimeType: string;
  state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
}

export async function uploadVideoToGemini(args: {
  buffer: Buffer;
  mimeType: string;
  displayName: string;
}): Promise<UploadedGeminiFile> {
  // Step 1: initiate resumable upload
  const initRes = await fetch(`${BASE}/upload/v1beta/files?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(args.buffer.byteLength),
      'X-Goog-Upload-Header-Content-Type': args.mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: args.displayName } }),
  });
  if (!initRes.ok) throw new Error(`Gemini upload init failed: ${initRes.status} ${await initRes.text()}`);
  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('Gemini did not return upload URL');

  // Step 2: upload bytes
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(args.buffer.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: args.buffer,
  });
  if (!uploadRes.ok) throw new Error(`Gemini upload bytes failed: ${uploadRes.status}`);
  const fileResp = await uploadRes.json();
  const file = fileResp.file as { uri: string; name: string; mimeType: string; state: string };

  // Step 3: poll until ACTIVE
  let state = file.state;
  let tries = 0;
  while (state === 'PROCESSING' && tries < 30) {
    await new Promise((r) => setTimeout(r, 2000));
    const checkRes = await fetch(`${BASE}/v1beta/${file.name}?key=${GEMINI_API_KEY}`);
    if (!checkRes.ok) break;
    const check = await checkRes.json();
    state = check.state;
    tries += 1;
  }
  if (state !== 'ACTIVE') throw new Error(`Gemini file did not reach ACTIVE state (got ${state})`);

  return { uri: file.uri, name: file.name, mimeType: file.mimeType, state: 'ACTIVE' };
}

export async function deleteGeminiFile(name: string): Promise<void> {
  await fetch(`${BASE}/v1beta/${name}?key=${GEMINI_API_KEY}`, { method: 'DELETE' });
}
```

- [ ] **Step 2:** Commit
```bash
git add lib/gemini/file-api.ts
git commit -m "feat(gemini): file api upload helper"
```

### Task 2.2: Video analysis function

**Files:**
- Create: `lib/calendar/analyze-video.ts`

- [ ] **Step 1:** Call generateContent with a structured-output prompt referencing the uploaded file:

```ts
// lib/calendar/analyze-video.ts
import { uploadVideoToGemini } from '@/lib/gemini/file-api';
import type { GeminiContext } from '@/lib/types/calendar';

const GEMINI_API_KEY = process.env.GOOGLE_AI_STUDIO_KEY;
const MODEL = 'gemini-2.5-flash';

const PROMPT = `You are analyzing a short-form vertical video (TikTok / Reels / Shorts) for a marketing agency.
Return ONLY a JSON object matching this exact schema, no markdown, no preamble:

{
  "one_liner": "single sentence describing what happens in this video",
  "hook_seconds_0_3": "what is literally on screen and audible in seconds 0-3",
  "visual_themes": ["array of 3-6 short tags describing visual content"],
  "audio_summary": "music style + voiceover/dialogue + ambient sounds",
  "spoken_text_summary": "summary of any spoken words or text on screen, empty string if none",
  "mood": "one word like energetic / calm / playful / serious / inspiring",
  "pacing": "slow | medium | fast",
  "recommended_caption_angle": "one sentence suggesting the most magnetic angle for the caption",
  "key_moments": [{"t": 0, "description": "..."}, {"t": 3, "description": "..."}]
}

Be honest. If the video is low-quality or hard to read, say so in mood/one_liner.`;

export async function analyzeVideo(args: {
  videoUrl: string;
  buffer: Buffer;
  mimeType: string;
  displayName: string;
}): Promise<{ context: GeminiContext; fileUri: string; fileName: string }> {
  const file = await uploadVideoToGemini({
    buffer: args.buffer,
    mimeType: args.mimeType,
    displayName: args.displayName,
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { fileData: { fileUri: file.uri, mimeType: file.mimeType } },
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini analysis failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text');
  const context = JSON.parse(text) as GeminiContext;

  return { context, fileUri: file.uri, fileName: file.name };
}
```

- [ ] **Step 2:** Commit
```bash
git add lib/calendar/analyze-video.ts
git commit -m "feat(calendar): gemini video context analysis"
```

### Task 2.3: Wire analysis into ingestion pipeline

**Files:**
- Modify: `lib/calendar/ingest-drop.ts`

- [ ] **Step 1:** After the download phase completes, add an analysis loop. Append to `ingestDrop`:

```ts
// After Promise.all([worker(), worker(), worker()]) and before status='analyzing' update.

// 4. Analyze each video with Gemini File API (concurrency=2 to avoid rate limits)
const { analyzeVideo } = await import('./analyze-video');
const { data: rowsToAnalyze } = await supabase
  .from('content_drop_videos')
  .select('*')
  .eq('drop_id', dropId)
  .eq('status', 'analyzing');

const queue2 = [...(rowsToAnalyze ?? [])];
const analyzeWorker = async () => {
  while (queue2.length) {
    const v = queue2.shift();
    if (!v || !v.video_url) continue;
    try {
      // Re-download from public URL (we already have it in storage)
      const buf = await fetch(v.video_url).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b));
      const { context, fileUri } = await analyzeVideo({
        videoUrl: v.video_url,
        buffer: buf,
        mimeType: v.mime_type || 'video/mp4',
        displayName: v.drive_file_name,
      });
      await supabase
        .from('content_drop_videos')
        .update({ gemini_context: context, gemini_file_uri: fileUri, status: 'caption_pending' })
        .eq('id', v.id);
    } catch (err) {
      await supabase
        .from('content_drop_videos')
        .update({ status: 'failed', error_detail: `analysis: ${err instanceof Error ? err.message : err}` })
        .eq('id', v.id);
    }
  }
};
await Promise.all([analyzeWorker(), analyzeWorker()]);

await supabase.from('content_drops').update({ status: 'generating' }).eq('id', dropId);
```

- [ ] **Step 2:** Verify `npx tsc --noEmit` clean.

- [ ] **Step 3:** Commit
```bash
git add lib/calendar/ingest-drop.ts
git commit -m "feat(calendar): wire gemini analysis into ingestion"
```

### Task 2.4: Smoke test

- [ ] **Step 1:** Re-run the same drop creation as Phase 1.5. Wait ~3 min.
- [ ] **Step 2:** Inspect one row's `gemini_context` field via Supabase MCP `execute_sql`. Verify all required keys present.
- [ ] **Step 3:** If output is junk, iterate on prompt.

### Phase 2 verification gate

- [ ] All videos have `gemini_context` with non-null required keys
- [ ] `gemini_file_uri` populated
- [ ] Drop status = `generating`
- [ ] Sample one context in chat to sanity-check quality

---

## Phase 3 — Caption generation + rubric

### Task 3.1: Caption grader (TDD)

**Files:**
- Create: `lib/calendar/__tests__/grade-caption.test.ts`
- Create: `lib/calendar/grade-caption.ts`

- [ ] **Step 1:** Write failing tests:

```ts
// lib/calendar/__tests__/grade-caption.test.ts
import { describe, it, expect } from 'vitest';
import { gradeCaption } from '../grade-caption';

describe('gradeCaption', () => {
  it('awards full body_length when 100-200 chars', () => {
    const body = 'a'.repeat(150);
    const result = gradeCaption(`${body}\n\nFollow for more`, ['fitness'], ['fitness']);
    expect(result.body_length).toBe(30);
  });
  it('awards full cta_separation for own-line known verb', () => {
    const text = 'short body\n\nFollow for daily tips';
    const r = gradeCaption(text, [], []);
    expect(r.cta_separation).toBe(30);
  });
  it('penalises missing CTA', () => {
    const r = gradeCaption('just a description with no call to action whatsoever', [], []);
    expect(r.cta_separation).toBe(0);
  });
  it('hashtag_relevance scales with niche overlap', () => {
    const r = gradeCaption('body\n\nSave this', ['fitness', 'gym', 'lift'], ['fitness', 'gym', 'lift']);
    expect(r.hashtag_relevance).toBe(25);
  });
  it('returns 0-100 total', () => {
    const r = gradeCaption('a'.repeat(150) + '\n\nFollow for more', ['fitness'], ['fitness']);
    expect(r.total).toBeLessThanOrEqual(100);
    expect(r.total).toBeGreaterThan(60);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run lib/calendar/__tests__/grade-caption.test.ts` — confirm "function not defined" fail.

- [ ] **Step 3:** Implement:

```ts
// lib/calendar/grade-caption.ts
import type { CaptionGrade } from '@/lib/types/calendar';

const CTA_VERBS = /\b(follow|save|comment|tag|try|share|drop|book|grab|click|swipe|sign up|join|subscribe|dm)\b/i;

function scoreBodyLength(bodyChars: number): number {
  if (bodyChars >= 100 && bodyChars <= 200) return 30;
  if (bodyChars >= 80 && bodyChars <= 220) return 22;
  if (bodyChars >= 60 && bodyChars <= 260) return 14;
  return 5;
}

function scoreCtaSeparation(text: string): { score: number; reason: string } {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { score: 0, reason: 'CTA must be on its own line' };
  const last = lines[lines.length - 1];
  if (CTA_VERBS.test(last) && last.length <= 80) return { score: 30, reason: '' };
  if (CTA_VERBS.test(text)) return { score: 18, reason: 'CTA is present but embedded — move to its own line' };
  return { score: 0, reason: 'No clear CTA found' };
}

function scoreHashtagRelevance(hashtags: string[], niche: string[]): { score: number; reason: string } {
  if (hashtags.length === 0) return { score: 0, reason: 'No hashtags' };
  const lowerNiche = new Set(niche.map((s) => s.toLowerCase().replace(/^#/, '')));
  const matches = hashtags.filter((h) => lowerNiche.has(h.toLowerCase().replace(/^#/, ''))).length;
  const pct = matches / hashtags.length;
  if (pct >= 0.8) return { score: 25, reason: '' };
  if (pct >= 0.5) return { score: 18, reason: 'Some hashtags drift from the niche' };
  if (pct >= 0.2) return { score: 10, reason: 'Most hashtags drift from the niche' };
  return { score: 3, reason: 'Hashtags do not match the client niche' };
}

export function gradeCaption(text: string, hashtags: string[], niche: string[]): CaptionGrade {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const body = lines.length >= 2 ? lines.slice(0, -1).join('\n') : text;
  const bodyLen = body.replace(/[#@][\w-]+/g, '').trim().length;

  const body_length = scoreBodyLength(bodyLen);
  const ctaResult = scoreCtaSeparation(text);
  const hashtagResult = scoreHashtagRelevance(hashtags, niche);
  const voice_match = 12; // default; LLM-judged voice score injected externally if desired
  const total = body_length + ctaResult.score + hashtagResult.score + voice_match;

  const reasons: string[] = [];
  if (body_length < 30) reasons.push(`Body length ${bodyLen} chars — aim for 100-200`);
  if (ctaResult.reason) reasons.push(ctaResult.reason);
  if (hashtagResult.reason) reasons.push(hashtagResult.reason);

  return {
    total,
    body_length,
    cta_separation: ctaResult.score,
    hashtag_relevance: hashtagResult.score,
    voice_match,
    reasons,
  };
}
```

- [ ] **Step 4:** Run `npx vitest run lib/calendar/__tests__/grade-caption.test.ts` — confirm all pass.

- [ ] **Step 5:** Commit
```bash
git add lib/calendar/grade-caption.ts lib/calendar/__tests__/grade-caption.test.ts
git commit -m "feat(calendar): caption rubric grader"
```

### Task 3.2: Caption generator with rubric loop

**Files:**
- Create: `lib/calendar/generate-caption.ts`

- [ ] **Step 1:** Write generator. Use OpenRouter via existing patterns (search for OpenRouter usage in `lib/`):

```ts
// lib/calendar/generate-caption.ts
import { gradeCaption } from './grade-caption';
import type { GeminiContext, CaptionGrade } from '@/lib/types/calendar';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'anthropic/claude-sonnet-4.5';

export interface SavedCaption { title: string; caption_text: string; hashtags: string[] }
export interface GenerateInputs {
  brandVoice: string;
  targetAudience: string;
  services: string[];
  topicKeywords: string[];
  savedCaptions: SavedCaption[];
  recentCaptions: string[];
  geminiContext: GeminiContext;
  feedback?: string[];
}
export interface GenerateOutput {
  caption: string;
  hashtags: string[];
  grade: CaptionGrade;
  iterations: number;
}

function buildPrompt(args: GenerateInputs): string {
  return `You are writing a short-form vertical video caption for a marketing client.

CLIENT BRAND VOICE: ${args.brandVoice || '(unspecified)'}
TARGET AUDIENCE: ${args.targetAudience || '(unspecified)'}
SERVICES: ${args.services.join(', ') || '(none)'}
TOPIC KEYWORDS / NICHE: ${args.topicKeywords.join(', ') || '(none)'}

SAVED CAPTION TEMPLATES (study tone & structure, do not copy verbatim):
${args.savedCaptions.map((c, i) => `--- Template ${i+1}: ${c.title} ---\n${c.caption_text}\nhashtags: ${c.hashtags.join(' ')}`).join('\n\n') || '(none)'}

RECENT CAPTIONS THIS CLIENT HAS POSTED (last 7 days, match style):
${args.recentCaptions.slice(0, 5).map((c, i) => `${i+1}) ${c}`).join('\n') || '(none)'}

THIS VIDEO:
- One-liner: ${args.geminiContext.one_liner}
- Hook (0-3s): ${args.geminiContext.hook_seconds_0_3}
- Mood: ${args.geminiContext.mood}, pacing: ${args.geminiContext.pacing}
- Visual themes: ${args.geminiContext.visual_themes.join(', ')}
- Audio: ${args.geminiContext.audio_summary}
- Spoken/on-screen text: ${args.geminiContext.spoken_text_summary || '(none)'}
- Recommended angle: ${args.geminiContext.recommended_caption_angle}

WRITING RULES:
- Body 100-200 characters (excluding CTA + hashtags). Match the client's recent captions.
- One blank line, then ONE clear call-to-action on its own line. Use a verb like Follow / Save / Comment / Try / Tag.
- 3-6 hashtags after the CTA, on a new line, separated by spaces. Pull primarily from the saved-caption templates and topic keywords. No fluff hashtags like #fyp or #foryou unless the client uses them in saved captions.
- Sentence case. No emojis unless saved captions use them.
${args.feedback?.length ? `\nPREVIOUS ATTEMPT FAILED RUBRIC. ADDRESS THESE:\n- ${args.feedback.join('\n- ')}` : ''}

Return ONLY a JSON object:
{ "caption": "<full caption text including CTA but NOT hashtag line>", "hashtags": ["tag1","tag2"] }`;
}

async function callOpenRouter(prompt: string): Promise<{ caption: string; hashtags: string[] }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://cortex.nativz.io',
      'X-Title': 'Nativz Cortex',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned no content');
  const parsed = JSON.parse(text);
  return { caption: parsed.caption ?? '', hashtags: parsed.hashtags ?? [] };
}

export async function generateCaption(input: GenerateInputs): Promise<GenerateOutput> {
  const niche = [...input.topicKeywords, ...input.savedCaptions.flatMap((c) => c.hashtags)];
  let best: GenerateOutput | null = null;
  let feedback: string[] = [];

  for (let iter = 1; iter <= 3; iter++) {
    const prompt = buildPrompt({ ...input, feedback });
    const { caption, hashtags } = await callOpenRouter(prompt);
    const grade = gradeCaption(caption, hashtags, niche);
    const result: GenerateOutput = { caption, hashtags, grade, iterations: iter };
    if (!best || grade.total > best.grade.total) best = result;
    if (grade.total >= 80) return result;
    feedback = grade.reasons;
  }
  return best!;
}
```

- [ ] **Step 2:** Verify `npx tsc --noEmit` clean.

- [ ] **Step 3:** Commit
```bash
git add lib/calendar/generate-caption.ts
git commit -m "feat(calendar): caption generator with rubric loop"
```

### Task 3.3: Wire caption generation into pipeline

**Files:**
- Modify: `lib/calendar/ingest-drop.ts`

- [ ] **Step 1:** After analysis loop, add caption generation. Append to `ingestDrop`:

```ts
// 5. Caption generation
const { generateCaption } = await import('./generate-caption');

const { data: client } = await supabase
  .from('clients')
  .select('id, name, brand_voice, target_audience, services, topic_keywords')
  .eq('id', drop.client_id)
  .single();

const { data: saved } = await supabase
  .from('saved_captions')
  .select('title, caption_text, hashtags')
  .eq('client_id', drop.client_id);

const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const { data: recent } = await supabase
  .from('scheduled_posts')
  .select('caption')
  .eq('client_id', drop.client_id)
  .eq('status', 'published')
  .gte('published_at', sevenDaysAgo.toISOString())
  .order('published_at', { ascending: false })
  .limit(5);

const recentCaptions: string[] = (recent ?? []).map((r) => r.caption).filter(Boolean);

const { data: rowsToCaption } = await supabase
  .from('content_drop_videos')
  .select('*')
  .eq('drop_id', dropId)
  .eq('status', 'caption_pending');

for (const v of rowsToCaption ?? []) {
  if (!v.gemini_context) continue;
  try {
    const out = await generateCaption({
      brandVoice: client?.brand_voice || '',
      targetAudience: client?.target_audience || '',
      services: client?.services || [],
      topicKeywords: client?.topic_keywords || [],
      savedCaptions: saved || [],
      recentCaptions,
      geminiContext: v.gemini_context,
    });
    await supabase
      .from('content_drop_videos')
      .update({
        status: 'ready',
        caption_score: out.grade.total,
        caption_iterations: out.iterations,
      })
      .eq('id', v.id);

    // Stash caption + hashtags as draft on scheduled_posts (we'll create the row later in schedule phase)
    // For now keep them on the drop video row — add columns if needed in next migration.
    // SIMPLER: piggy-back on gemini_context.degraded? No — store in a draft field.
    // We'll store the generated caption in a separate JSON field on the drop video row.
  } catch (err) {
    await supabase
      .from('content_drop_videos')
      .update({ status: 'failed', error_detail: `caption: ${err instanceof Error ? err.message : err}` })
      .eq('id', v.id);
  }
}

await supabase.from('content_drops').update({ status: 'ready' }).eq('id', dropId);
```

- [ ] **Step 2:** Now we need to store the generated caption + hashtags on the video row. Add columns via a small migration:

Create `supabase/migrations/176_drop_videos_draft_caption.sql`:

```sql
ALTER TABLE content_drop_videos
  ADD COLUMN draft_caption TEXT,
  ADD COLUMN draft_hashtags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN draft_scheduled_at TIMESTAMPTZ;
```

Apply via `mcp__supabase__apply_migration`.

- [ ] **Step 3:** Update the caption-write step to populate these:

```ts
await supabase
  .from('content_drop_videos')
  .update({
    status: 'ready',
    draft_caption: out.caption,
    draft_hashtags: out.hashtags,
    caption_score: out.grade.total,
    caption_iterations: out.iterations,
  })
  .eq('id', v.id);
```

- [ ] **Step 4:** Update `ContentDropVideo` type in `lib/types/calendar.ts` with the new fields.

- [ ] **Step 5:** Verify `npx tsc --noEmit` clean.

- [ ] **Step 6:** Commit
```bash
git add lib/calendar/ingest-drop.ts lib/types/calendar.ts supabase/migrations/176_drop_videos_draft_caption.sql
git commit -m "feat(calendar): caption generation in pipeline"
```

### Phase 3 verification gate

- [ ] Run a full drop end-to-end. Within ~5 min, drop reaches `status=ready`.
- [ ] All videos have `draft_caption`, `draft_hashtags`, `caption_score >= 80` (or all 3 attempts captured)
- [ ] Sample 1 caption in chat — body 100-200 chars, CTA on own line, hashtags niche-aligned

---

## Phase 4 — Even-distribution + Zernio scheduling

### Task 4.1: Slot distribution (TDD)

**Files:**
- Create: `lib/calendar/__tests__/distribute-slots.test.ts`
- Create: `lib/calendar/distribute-slots.ts`

- [ ] **Step 1:** Tests:

```ts
import { describe, it, expect } from 'vitest';
import { distributeSlots } from '../distribute-slots';

describe('distributeSlots', () => {
  it('single video → start date', () => {
    const slots = distributeSlots(1, '2026-05-01', '2026-05-15', '10:00');
    expect(slots).toHaveLength(1);
    expect(slots[0].toISOString().startsWith('2026-05-01')).toBe(true);
  });
  it('10 videos over 28 days spaced ~3 days apart', () => {
    const slots = distributeSlots(10, '2026-05-01', '2026-05-29', '10:00');
    expect(slots).toHaveLength(10);
    const first = slots[0].getTime();
    const last = slots[9].getTime();
    const interval = (last - first) / 9 / (24 * 3600 * 1000);
    expect(interval).toBeGreaterThan(3);
    expect(interval).toBeLessThan(3.2);
  });
  it('bumps later collision by 4 hours when same day', () => {
    const slots = distributeSlots(20, '2026-05-01', '2026-05-04', '10:00');
    const sameDayCount = new Map<string, number>();
    for (const s of slots) {
      const key = s.toISOString().slice(0, 10);
      sameDayCount.set(key, (sameDayCount.get(key) ?? 0) + 1);
    }
    // No two slots in the same minute on same day
    const minutes = slots.map((s) => s.toISOString().slice(0, 16));
    expect(new Set(minutes).size).toBe(slots.length);
  });
  it('honors defaultTime', () => {
    const slots = distributeSlots(2, '2026-05-01', '2026-05-15', '14:30');
    expect(slots[0].getUTCHours()).toBe(14);
    expect(slots[0].getUTCMinutes()).toBe(30);
  });
});
```

- [ ] **Step 2:** Implement:

```ts
// lib/calendar/distribute-slots.ts

export function distributeSlots(
  videoCount: number,
  startDate: string, // YYYY-MM-DD
  endDate: string,
  defaultTime: string, // HH:MM
): Date[] {
  if (videoCount <= 0) return [];
  const [hh, mm] = defaultTime.split(':').map(Number);

  const start = new Date(`${startDate}T${defaultTime}:00.000Z`);
  const end = new Date(`${endDate}T${defaultTime}:00.000Z`);

  if (videoCount === 1) return [start];

  const totalMs = end.getTime() - start.getTime();
  const slots: Date[] = [];
  for (let i = 0; i < videoCount; i++) {
    const ms = start.getTime() + Math.round((i * totalMs) / (videoCount - 1));
    slots.push(new Date(ms));
  }

  // Snap to defaultTime, then bump same-minute collisions
  for (let i = 0; i < slots.length; i++) {
    slots[i].setUTCHours(hh, mm, 0, 0);
  }
  const used = new Set<string>();
  for (const s of slots) {
    let key = s.toISOString().slice(0, 16);
    while (used.has(key)) {
      s.setUTCHours(s.getUTCHours() + 4);
      key = s.toISOString().slice(0, 16);
    }
    used.add(key);
  }
  return slots;
}
```

- [ ] **Step 3:** Run vitest until green.

- [ ] **Step 4:** Commit
```bash
git add lib/calendar/distribute-slots.ts lib/calendar/__tests__/distribute-slots.test.ts
git commit -m "feat(calendar): slot distribution"
```

### Task 4.2: Auto-assign slots when drop is ready

**Files:**
- Modify: `lib/calendar/ingest-drop.ts`

- [ ] **Step 1:** After all captions generated and before setting status='ready', distribute slots:

```ts
// 6. Distribute scheduled times
const { distributeSlots } = await import('./distribute-slots');
const { data: readyVideos } = await supabase
  .from('content_drop_videos')
  .select('id, order_index')
  .eq('drop_id', dropId)
  .eq('status', 'ready')
  .order('order_index');
const slots = distributeSlots(
  readyVideos?.length ?? 0,
  drop.start_date,
  drop.end_date,
  drop.default_post_time,
);
for (let i = 0; i < (readyVideos ?? []).length; i++) {
  await supabase
    .from('content_drop_videos')
    .update({ draft_scheduled_at: slots[i].toISOString() })
    .eq('id', readyVideos![i].id);
}
```

- [ ] **Step 2:** Commit
```bash
git add lib/calendar/ingest-drop.ts
git commit -m "feat(calendar): auto-distribute slots on ready"
```

### Task 4.3: Schedule endpoint — push to Zernio

**Files:**
- Create: `lib/calendar/schedule-drop.ts`
- Create: `app/api/calendar/drops/[id]/schedule/route.ts`

- [ ] **Step 1:** Read [lib/posting/zernio.ts](lib/posting/zernio.ts) to confirm `publishPost` signature.

- [ ] **Step 2:** Write `lib/calendar/schedule-drop.ts`:

```ts
// lib/calendar/schedule-drop.ts
import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting/zernio'; // confirm export name

export async function scheduleDropPosts(dropId: string, userId: string): Promise<{ scheduled: number; failed: number }> {
  const supabase = createAdminClient();

  const { data: drop } = await supabase.from('content_drops').select('*').eq('id', dropId).single();
  if (!drop) throw new Error('Drop not found');

  const { data: profiles } = await supabase
    .from('social_profiles')
    .select('id, late_account_id, platform')
    .eq('client_id', drop.client_id)
    .eq('is_active', true);
  if (!profiles || profiles.length === 0) throw new Error('No active social profiles for this client');

  const { data: videos } = await supabase
    .from('content_drop_videos')
    .select('*')
    .eq('drop_id', dropId)
    .eq('status', 'ready');

  const zernio = new ZernioPostingService();
  let scheduled = 0;
  let failed = 0;

  for (const v of videos ?? []) {
    if (!v.video_url || !v.draft_caption || !v.draft_scheduled_at) {
      failed += 1; continue;
    }
    try {
      // Create scheduled_posts row
      const { data: post, error: insertErr } = await supabase
        .from('scheduled_posts')
        .insert({
          client_id: drop.client_id,
          created_by: userId,
          status: 'scheduled',
          scheduled_at: v.draft_scheduled_at,
          caption: v.draft_caption,
          hashtags: v.draft_hashtags,
          cover_image_url: v.thumbnail_url,
          post_type: 'reel',
        })
        .select()
        .single();
      if (insertErr || !post) { failed += 1; continue; }

      // Junction rows
      for (const p of profiles) {
        await supabase.from('scheduled_post_platforms').insert({
          post_id: post.id,
          social_profile_id: p.id,
          status: 'pending',
        });
      }

      // Push to Zernio
      const platformHints: Record<string, string> = {};
      for (const p of profiles) platformHints[p.late_account_id] = p.platform;

      const result = await zernio.publishPost({
        videoUrl: v.video_url,
        caption: v.draft_caption,
        hashtags: v.draft_hashtags,
        coverImageUrl: v.thumbnail_url ?? undefined,
        platformProfileIds: profiles.map((p) => p.late_account_id),
        platformHints,
        scheduledAt: v.draft_scheduled_at,
      });
      await supabase
        .from('scheduled_posts')
        .update({ late_post_id: result.externalPostId })
        .eq('id', post.id);
      await supabase
        .from('content_drop_videos')
        .update({ scheduled_post_id: post.id })
        .eq('id', v.id);
      scheduled += 1;
    } catch (err) {
      console.error('schedule error', err);
      failed += 1;
    }
  }
  await supabase.from('content_drops').update({ status: 'scheduled' }).eq('id', dropId);
  return { scheduled, failed };
}
```

- [ ] **Step 3:** Write the route:

```ts
// app/api/calendar/drops/[id]/schedule/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { scheduleDropPosts } from '@/lib/calendar/schedule-drop';

export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const result = await scheduleDropPosts(id, user.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 4:** Verify `npx tsc --noEmit` clean.

- [ ] **Step 5:** Commit
```bash
git add lib/calendar/schedule-drop.ts app/api/calendar/drops/[id]/schedule/route.ts
git commit -m "feat(calendar): schedule drop via zernio"
```

### Phase 4 verification gate

- [ ] POST `/api/calendar/drops/[id]/schedule` returns `{scheduled: N, failed: 0}`
- [ ] `scheduled_posts` rows created with non-null `late_post_id`
- [ ] Zernio dashboard shows the scheduled posts at the right times
- [ ] Drop status = `scheduled`

---

## Phase 5 — Admin Calendar UI

### Task 5.1: Patch endpoint for editing video draft fields

**Files:**
- Create: `app/api/calendar/drops/[id]/videos/[videoId]/route.ts`
- Create: `app/api/calendar/drops/[id]/videos/[videoId]/regenerate-caption/route.ts`

- [ ] **Step 1:** PATCH endpoint:

```ts
// app/api/calendar/drops/[id]/videos/[videoId]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const patchSchema = z.object({
  draft_caption: z.string().optional(),
  draft_hashtags: z.array(z.string()).optional(),
  draft_scheduled_at: z.string().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; videoId: string }> }) {
  const { videoId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data, error } = await supabase
    .from('content_drop_videos')
    .update(parsed.data)
    .eq('id', videoId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ video: data });
}
```

- [ ] **Step 2:** Regenerate route:

```ts
// app/api/calendar/drops/[id]/videos/[videoId]/regenerate-caption/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateCaption } from '@/lib/calendar/generate-caption';

export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; videoId: string }> }) {
  const { id: dropId, videoId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: video } = await admin.from('content_drop_videos').select('*').eq('id', videoId).single();
  if (!video || !video.gemini_context) return NextResponse.json({ error: 'video not analyzed' }, { status: 400 });

  const { data: drop } = await admin.from('content_drops').select('client_id').eq('id', dropId).single();
  if (!drop) return NextResponse.json({ error: 'drop not found' }, { status: 404 });

  const { data: client } = await admin
    .from('clients')
    .select('brand_voice, target_audience, services, topic_keywords')
    .eq('id', drop.client_id)
    .single();
  const { data: saved } = await admin.from('saved_captions').select('title, caption_text, hashtags').eq('client_id', drop.client_id);

  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: recent } = await admin
    .from('scheduled_posts')
    .select('caption').eq('client_id', drop.client_id).eq('status', 'published')
    .gte('published_at', sevenDaysAgo.toISOString()).limit(5);

  const out = await generateCaption({
    brandVoice: client?.brand_voice ?? '',
    targetAudience: client?.target_audience ?? '',
    services: client?.services ?? [],
    topicKeywords: client?.topic_keywords ?? [],
    savedCaptions: saved ?? [],
    recentCaptions: (recent ?? []).map((r) => r.caption).filter(Boolean),
    geminiContext: video.gemini_context,
  });

  const { data: updated } = await admin
    .from('content_drop_videos')
    .update({
      draft_caption: out.caption,
      draft_hashtags: out.hashtags,
      caption_score: out.grade.total,
      caption_iterations: out.iterations,
    })
    .eq('id', videoId)
    .select()
    .single();

  return NextResponse.json({ video: updated, grade: out.grade });
}
```

- [ ] **Step 3:** Commit
```bash
git add app/api/calendar/drops/[id]/videos
git commit -m "feat(calendar): patch + regenerate-caption endpoints"
```

### Task 5.2: Drops list view + create-drop modal

**Files:**
- Create: `components/calendar/drops-list.tsx`
- Create: `components/calendar/create-drop-modal.tsx`
- Modify: `app/admin/calendar/page.tsx`

- [ ] **Step 1:** `components/calendar/create-drop-modal.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CreateDropModal({
  open, onOpenChange, clientId, onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  clientId: string;
  onCreated: (dropId: string) => void;
}) {
  const [driveUrl, setDriveUrl] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch('/api/calendar/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, driveFolderUrl: driveUrl, startDate: start, endDate: end }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data.drop.id);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New content drop</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Google Drive folder URL</Label>
            <Input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting || !driveUrl || !start || !end}>
              {submitting ? 'Creating…' : 'Create drop'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2:** `components/calendar/drops-list.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import type { ContentDrop } from '@/lib/types/calendar';

const STATUS_STYLES: Record<string, string> = {
  ingesting: 'bg-blue-500/15 text-blue-300',
  analyzing: 'bg-violet-500/15 text-violet-300',
  generating: 'bg-amber-500/15 text-amber-300',
  ready: 'bg-emerald-500/15 text-emerald-300',
  scheduled: 'bg-emerald-600/20 text-emerald-200',
  failed: 'bg-red-500/15 text-red-300',
};

export function DropsList({ drops }: { drops: ContentDrop[] }) {
  if (drops.length === 0) return null;
  return (
    <div className="space-y-3">
      {drops.map((d) => (
        <Link
          key={d.id}
          href={`/admin/calendar/${d.id}`}
          className="block rounded-xl border border-nativz-border bg-surface p-4 transition-colors hover:bg-surface-hover"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <CalendarDays className="h-5 w-5 shrink-0 text-text-tertiary" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">
                  {d.start_date} → {d.end_date}
                </div>
                <div className="truncate text-xs text-text-secondary">
                  {d.processed_videos}/{d.total_videos} videos · created {new Date(d.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[d.status] || 'bg-surface text-text-secondary'}`}>
              {d.status}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3:** Update `app/admin/calendar/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useBrand } from '@/lib/brand/use-brand';
import { CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateDropModal } from '@/components/calendar/create-drop-modal';
import { DropsList } from '@/components/calendar/drops-list';
import { useRouter } from 'next/navigation';
import type { ContentDrop } from '@/lib/types/calendar';

export default function CalendarPage() {
  const { brand } = useBrand();
  const router = useRouter();
  const [drops, setDrops] = useState<ContentDrop[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!brand?.id) return;
    setLoading(true);
    fetch(`/api/calendar/drops?clientId=${brand.id}`)
      .then((r) => r.json())
      .then((data) => setDrops(data.drops ?? []))
      .finally(() => setLoading(false));
  }, [brand?.id]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Content calendar</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Drop a Drive folder, get scheduled posts and a client share link.
          </p>
        </div>
        {brand && (
          <Button onClick={() => setModalOpen(true)} className="shrink-0">
            <Plus className="mr-1.5 h-4 w-4" />
            New drop
          </Button>
        )}
      </header>

      {!brand && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">Pick a brand from the sidebar to get started.</p>
        </div>
      )}

      {brand && !loading && drops.length === 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">No drops yet for {brand.name}. Click "New drop" to start.</p>
        </div>
      )}

      {drops.length > 0 && <DropsList drops={drops} />}

      {brand && (
        <CreateDropModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          clientId={brand.id}
          onCreated={(dropId) => router.push(`/admin/calendar/${dropId}`)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4:** Commit
```bash
git add components/calendar app/admin/calendar/page.tsx
git commit -m "feat(calendar): drops list + create modal"
```

### Task 5.3: Drop detail page + video card

**Files:**
- Create: `app/admin/calendar/[dropId]/page.tsx`
- Create: `components/calendar/drop-detail-view.tsx`
- Create: `components/calendar/video-card.tsx`

- [ ] **Step 1:** `components/calendar/video-card.tsx` — full video player + editable caption + schedule + score badge:

```tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ContentDropVideo } from '@/lib/types/calendar';

export function VideoCard({
  video, dropId, selected, onToggleSelect, onUpdate,
}: {
  video: ContentDropVideo;
  dropId: string;
  selected: boolean;
  onToggleSelect: () => void;
  onUpdate: (v: ContentDropVideo) => void;
}) {
  const [caption, setCaption] = useState(video.draft_caption ?? '');
  const [hashtags, setHashtags] = useState((video.draft_hashtags ?? []).join(' '));
  const [scheduledAt, setScheduledAt] = useState(video.draft_scheduled_at?.slice(0, 16) ?? '');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar/drops/${dropId}/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_caption: caption,
          draft_hashtags: hashtags.split(/\s+/).filter(Boolean),
          draft_scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      onUpdate(data.video);
    } finally { setSaving(false); }
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/calendar/drops/${dropId}/videos/${video.id}/regenerate-caption`, { method: 'POST' });
      const data = await res.json();
      onUpdate(data.video);
      setCaption(data.video.draft_caption);
      setHashtags(data.video.draft_hashtags.join(' '));
    } finally { setRegenerating(false); }
  }

  const score = video.caption_score ?? 0;
  const scoreColor = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400';
  const ScoreIcon = score >= 80 ? CheckCircle2 : AlertCircle;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4 transition-colors">
      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-1 h-4 w-4 shrink-0 rounded border-nativz-border bg-surface text-accent2"
        />
        <div className="aspect-[9/16] w-32 shrink-0 overflow-hidden rounded-lg bg-black">
          {video.video_url && (
            <video src={video.video_url} controls poster={video.thumbnail_url ?? undefined} className="h-full w-full object-cover" preload="metadata" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="truncate text-sm font-medium text-text-primary">{video.drive_file_name}</h3>
            <div className={`flex items-center gap-1 text-xs ${scoreColor}`}>
              <ScoreIcon className="h-3.5 w-3.5" />
              <span>Score {video.caption_score ?? '—'}</span>
            </div>
          </div>
          <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} className="text-sm" />
          <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="hashtag1 hashtag2" className="text-xs font-mono" />
          <div className="flex items-center gap-2">
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-56 text-xs"
            />
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={regenerate} disabled={regenerating} title="Regenerate caption">
              {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** `components/calendar/drop-detail-view.tsx`:

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { VideoCard } from './video-card';
import { Loader2, ArrowLeft, Send, Share2 } from 'lucide-react';
import Link from 'next/link';
import type { ContentDrop, ContentDropVideo } from '@/lib/types/calendar';
import { ShareLinkModal } from './share-link-modal';

const TERMINAL = new Set(['ready', 'scheduled', 'failed']);

export function DropDetailView({ dropId }: { dropId: string }) {
  const [drop, setDrop] = useState<ContentDrop | null>(null);
  const [videos, setVideos] = useState<ContentDropVideo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduling, setScheduling] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/calendar/drops/${dropId}`);
    const data = await res.json();
    setDrop(data.drop);
    setVideos(data.videos ?? []);
  }, [dropId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (drop && !TERMINAL.has(drop.status)) {
      const i = setInterval(refresh, 3000);
      return () => clearInterval(i);
    }
  }, [drop, refresh]);

  async function scheduleAll() {
    setScheduling(true);
    try {
      await fetch(`/api/calendar/drops/${dropId}/schedule`, { method: 'POST' });
      await refresh();
    } finally { setScheduling(false); }
  }

  if (!drop) return <div className="p-8 text-text-secondary">Loading…</div>;

  const allReady = videos.length > 0 && videos.every((v) => v.status === 'ready' || v.status === 'failed');
  const readyPosts = videos.filter((v) => v.scheduled_post_id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4">
        <Link href="/admin/calendar" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-4 w-4" /> All drops
        </Link>
      </div>
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{drop.start_date} → {drop.end_date}</h1>
          <p className="mt-1 text-sm text-text-secondary">{drop.processed_videos}/{drop.total_videos} videos · {drop.status}</p>
        </div>
        <div className="flex items-center gap-2">
          {drop.status === 'ready' && (
            <Button onClick={scheduleAll} disabled={scheduling || !allReady}>
              {scheduling ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Schedule all
            </Button>
          )}
          {drop.status === 'scheduled' && readyPosts.length > 0 && (
            <Button onClick={() => setShareModalOpen(true)}>
              <Share2 className="mr-1.5 h-4 w-4" />
              Create share link
            </Button>
          )}
        </div>
      </header>

      {!TERMINAL.has(drop.status) && (
        <div className="mb-6 rounded-xl border border-nativz-border bg-surface p-4 text-center text-sm text-text-secondary">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-accent2-text" />
          {drop.status === 'ingesting' && 'Downloading videos from Drive…'}
          {drop.status === 'analyzing' && 'Analysing videos with Gemini…'}
          {drop.status === 'generating' && 'Writing captions in your brand voice…'}
        </div>
      )}

      <div className="space-y-3">
        {videos.map((v) => (
          <VideoCard
            key={v.id}
            video={v}
            dropId={dropId}
            selected={selected.has(v.id)}
            onToggleSelect={() => {
              setSelected((prev) => {
                const n = new Set(prev);
                n.has(v.id) ? n.delete(v.id) : n.add(v.id);
                return n;
              });
            }}
            onUpdate={(updated) => setVideos((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
          />
        ))}
      </div>

      <ShareLinkModal
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        dropId={dropId}
        candidatePosts={readyPosts.map((v) => ({
          videoId: v.id,
          postId: v.scheduled_post_id!,
          name: v.drive_file_name,
          thumbnail: v.thumbnail_url,
        }))}
        defaultSelectedIds={selected.size > 0 ? Array.from(selected).map((vid) => readyPosts.find((p) => p.id === vid)?.scheduled_post_id).filter(Boolean) as string[] : readyPosts.map((p) => p.scheduled_post_id!)}
      />
    </div>
  );
}
```

- [ ] **Step 3:** `app/admin/calendar/[dropId]/page.tsx`:

```tsx
import { DropDetailView } from '@/components/calendar/drop-detail-view';

export default async function DropDetailPage({ params }: { params: Promise<{ dropId: string }> }) {
  const { dropId } = await params;
  return <DropDetailView dropId={dropId} />;
}
```

- [ ] **Step 4:** Commit
```bash
git add app/admin/calendar/[dropId] components/calendar/drop-detail-view.tsx components/calendar/video-card.tsx
git commit -m "feat(calendar): drop detail page + video card"
```

### Phase 5 verification gate

- [ ] Run dev. Open `/admin/calendar` with a brand selected.
- [ ] Click "New drop", paste a Drive URL with 3+ videos, set dates, submit.
- [ ] Page redirects to drop detail. Live progress shown.
- [ ] After ~5 min: all videos visible with playable preview, editable caption, score badge ≥80, scheduled-at populated.
- [ ] Edit one caption, click Save, refresh — change persists.
- [ ] Click Regenerate on one video — new caption appears, score updates.
- [ ] Click "Schedule all" — within 30s, drop status = `scheduled`, Zernio dashboard shows the posts.

---

## Phase 6 — Public batch share link

### Task 6.1: Share-link create endpoint

**Files:**
- Create: `app/api/calendar/drops/[id]/share-links/route.ts`

- [ ] **Step 1:**

```ts
// app/api/calendar/drops/[id]/share-links/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({ postIds: z.array(z.string().uuid()).min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: dropId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const admin = createAdminClient();

  // Create one post_review_links row per included post (re-use existing comments table)
  const linkMap: Record<string, string> = {};
  for (const postId of parsed.data.postIds) {
    const { data: prl, error } = await admin
      .from('post_review_links')
      .insert({ post_id: postId })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    linkMap[postId] = prl.id;
  }

  const { data: shareLink, error: shareErr } = await admin
    .from('content_drop_share_links')
    .insert({
      drop_id: dropId,
      included_post_ids: parsed.data.postIds,
      post_review_link_map: linkMap,
    })
    .select()
    .single();
  if (shareErr) return NextResponse.json({ error: shareErr.message }, { status: 500 });

  return NextResponse.json({ shareLink, url: `/share/calendar/${shareLink.token}` });
}
```

- [ ] **Step 2:** Commit
```bash
git add app/api/calendar/drops/[id]/share-links/route.ts
git commit -m "feat(calendar): create share link endpoint"
```

### Task 6.2: Public share GET + comment endpoints

**Files:**
- Create: `app/api/calendar/share/[token]/route.ts`
- Create: `app/api/calendar/share/[token]/comment/route.ts`

- [ ] **Step 1:** GET endpoint (no auth):

```ts
// app/api/calendar/share/[token]/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const admin = createAdminClient();

  const { data: shareLink } = await admin
    .from('content_drop_share_links')
    .select('*, drop:content_drops(*, client:clients(name, brand_voice))')
    .eq('token', token)
    .single();
  if (!shareLink || new Date(shareLink.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired or not found' }, { status: 404 });
  }

  // Fetch posts + per-post comments via post_review_link_map
  const postIds = shareLink.included_post_ids;
  const reviewLinkIds = Object.values(shareLink.post_review_link_map);

  const { data: posts } = await admin
    .from('scheduled_posts')
    .select('id, caption, hashtags, scheduled_at, cover_image_url, post_type')
    .in('id', postIds);

  const { data: videos } = await admin
    .from('content_drop_videos')
    .select('scheduled_post_id, video_url, thumbnail_url, drive_file_name')
    .in('scheduled_post_id', postIds);

  const { data: comments } = await admin
    .from('post_review_comments')
    .select('*')
    .in('review_link_id', reviewLinkIds)
    .order('created_at');

  // Mark viewed
  await admin
    .from('content_drop_share_links')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', shareLink.id);

  return NextResponse.json({
    shareLink,
    drop: shareLink.drop,
    posts,
    videos,
    comments,
  });
}
```

- [ ] **Step 2:** Comment POST endpoint:

```ts
// app/api/calendar/share/[token]/comment/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  postId: z.string().uuid(),
  authorName: z.string().min(1).max(100),
  content: z.string().min(1).max(2000),
  status: z.enum(['approved', 'changes_requested', 'comment']),
});

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const admin = createAdminClient();
  const { data: shareLink } = await admin
    .from('content_drop_share_links')
    .select('post_review_link_map, expires_at')
    .eq('token', token)
    .single();
  if (!shareLink || new Date(shareLink.expires_at) < new Date())
    return NextResponse.json({ error: 'expired' }, { status: 404 });

  const reviewLinkId = shareLink.post_review_link_map[parsed.data.postId];
  if (!reviewLinkId) return NextResponse.json({ error: 'post not in this share link' }, { status: 400 });

  const { data, error } = await admin
    .from('post_review_comments')
    .insert({
      review_link_id: reviewLinkId,
      author_name: parsed.data.authorName,
      content: parsed.data.content,
      status: parsed.data.status,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ comment: data });
}
```

- [ ] **Step 3:** Commit
```bash
git add app/api/calendar/share/[token]
git commit -m "feat(calendar): public share-link GET + comment endpoints"
```

### Task 6.3: Share-link modal + share-link card

**Files:**
- Create: `components/calendar/share-link-modal.tsx`

- [ ] **Step 1:**

```tsx
'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Check } from 'lucide-react';

export function ShareLinkModal({
  open, onOpenChange, dropId, candidatePosts, defaultSelectedIds,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  dropId: string;
  candidatePosts: { videoId: string; postId: string; name: string; thumbnail: string | null }[];
  defaultSelectedIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelectedIds));
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/calendar/drops/${dropId}/share-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postIds: Array.from(selected) }),
      });
      const data = await res.json();
      const fullUrl = `${window.location.origin}${data.url}`;
      setUrl(fullUrl);
    } finally { setCreating(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create share link</DialogTitle></DialogHeader>
        {!url && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-text-secondary">Pick which scheduled posts to include in the client's review link.</p>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {candidatePosts.map((p) => (
                <label key={p.postId} className="flex items-center gap-3 rounded-lg border border-nativz-border bg-background-elevated p-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(p.postId)}
                    onChange={() => setSelected((prev) => { const n = new Set(prev); n.has(p.postId) ? n.delete(p.postId) : n.add(p.postId); return n; })}
                    className="h-4 w-4"
                  />
                  {p.thumbnail && <img src={p.thumbnail} alt="" className="h-12 w-9 rounded object-cover" />}
                  <span className="truncate text-sm">{p.name}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={create} disabled={creating || selected.size === 0}>
                {creating ? 'Creating…' : `Create link (${selected.size})`}
              </Button>
            </div>
          </div>
        )}
        {url && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-text-secondary">Send this link to your client:</p>
            <div className="flex gap-2">
              <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <Button
                onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2:** Commit
```bash
git add components/calendar/share-link-modal.tsx
git commit -m "feat(calendar): share-link modal"
```

### Task 6.4: Public share page

**Files:**
- Create: `app/share/calendar/[token]/page.tsx`

- [ ] **Step 1:**

```tsx
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ShareCalendarClient } from './share-calendar-client';

export default async function ShareCalendarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const host = h.get('host');
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  const res = await fetch(`${protocol}://${host}/api/calendar/share/${token}`, { cache: 'no-store' });
  if (!res.ok) notFound();
  const data = await res.json();

  return <ShareCalendarClient initialData={data} token={token} />;
}
```

- [ ] **Step 2:** `app/share/calendar/[token]/share-calendar-client.tsx` — interactive client component:

```tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { CheckCircle, AlertCircle, MessageSquare } from 'lucide-react';

interface Post { id: string; caption: string; hashtags: string[]; scheduled_at: string; cover_image_url: string | null }
interface Video { scheduled_post_id: string; video_url: string; thumbnail_url: string | null; drive_file_name: string }
interface Comment { id: string; review_link_id: string; author_name: string; content: string; status: string; created_at: string }

export function ShareCalendarClient({ initialData, token }: { initialData: any; token: string }) {
  const [data, setData] = useState(initialData);
  const [authorName, setAuthorName] = useState<string>('');

  useEffect(() => { setAuthorName(localStorage.getItem('nz_share_author') || ''); }, []);
  useEffect(() => { if (authorName) localStorage.setItem('nz_share_author', authorName); }, [authorName]);

  async function refetch() {
    const res = await fetch(`/api/calendar/share/${token}`, { cache: 'no-store' });
    setData(await res.json());
  }

  const posts: Post[] = data.posts ?? [];
  const videos: Video[] = data.videos ?? [];
  const comments: Comment[] = data.comments ?? [];
  const linkMap: Record<string, string> = data.shareLink.post_review_link_map;

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-2xl px-4">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-text-primary">{data.drop?.client?.name ?? 'Content calendar'}</h1>
          <p className="mt-1 text-sm text-text-secondary">Review your scheduled posts. Approve, request changes, or comment on any one.</p>
        </header>

        {!authorName && (
          <div className="mb-6 rounded-xl border border-nativz-border bg-surface p-4">
            <label className="text-xs text-text-secondary">Your name (so we know who's commenting)</label>
            <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Your name" className="mt-1" />
          </div>
        )}

        <div className="space-y-6">
          {posts.map((p) => {
            const v = videos.find((x) => x.scheduled_post_id === p.id);
            const reviewLinkId = linkMap[p.id];
            const postComments = comments.filter((c) => c.review_link_id === reviewLinkId);
            return (
              <PostCard
                key={p.id}
                post={p}
                video={v}
                comments={postComments}
                authorName={authorName}
                onComment={async (status, content) => {
                  await fetch(`/api/calendar/share/${token}/comment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ postId: p.id, authorName, content, status }),
                  });
                  await refetch();
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PostCard({ post, video, comments, authorName, onComment }: {
  post: Post; video?: Video; comments: Comment[]; authorName: string;
  onComment: (status: string, content: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (status: string) => {
    if (!authorName) { alert('Enter your name first'); return; }
    if (!text.trim() && status === 'comment') return;
    setSubmitting(true);
    try {
      await onComment(status, text.trim() || (status === 'approved' ? 'Approved' : 'Changes requested'));
      setText('');
    } finally { setSubmitting(false); }
  };
  return (
    <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
      {video?.video_url && (
        <div className="aspect-[9/16] w-full bg-black sm:max-h-[600px]">
          <video src={video.video_url} controls poster={video.thumbnail_url ?? undefined} className="h-full w-full object-contain" />
        </div>
      )}
      <div className="p-4 space-y-3">
        <div className="text-xs text-text-secondary">
          Scheduled for {new Date(post.scheduled_at).toLocaleString()}
        </div>
        <p className="whitespace-pre-wrap text-sm text-text-primary">{post.caption}</p>
        {post.hashtags?.length > 0 && (
          <p className="text-xs text-text-secondary">{post.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}</p>
        )}

        <div className="border-t border-nativz-border pt-3 space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-background-elevated p-2">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="font-medium text-text-primary">{c.author_name}</span>
                <StatusBadge status={c.status} />
                <span>· {new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm">{c.content}</p>
            </div>
          ))}
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Add a comment…" />
          <div className="flex gap-2">
            <Button size="sm" disabled={submitting} onClick={() => submit('approved')}>
              <CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Approve
            </Button>
            <Button size="sm" variant="ghost" disabled={submitting} onClick={() => submit('changes_requested')}>
              <AlertCircle className="mr-1.5 h-3.5 w-3.5" /> Request changes
            </Button>
            <Button size="sm" variant="ghost" disabled={submitting} onClick={() => submit('comment')}>
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Comment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') return <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-300">approved</span>;
  if (status === 'changes_requested') return <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-300">changes requested</span>;
  return null;
}
```

- [ ] **Step 3:** Commit
```bash
git add app/share/calendar
git commit -m "feat(calendar): public batch share page"
```

### Phase 6 verification gate

- [ ] Open share link in incognito.
- [ ] Watch each video inline.
- [ ] Enter name, leave a comment, mark one approved, mark one changes-requested.
- [ ] Refresh — comments persist.
- [ ] Admin sees them on next refresh of drop detail page (TODO: surface comments inline in drop detail — note as follow-up if not done in this phase).

---

## Phase 7 — Brand-pill green-dot indicator

### Task 7.1: Scheduled-summary endpoint

**Files:**
- Create: `app/api/calendar/scheduled-summary/route.ts`

- [ ] **Step 1:**

```ts
// app/api/calendar/scheduled-summary/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const sevenDays = new Date(); sevenDays.setDate(sevenDays.getDate() + 7);

  const { data, error } = await admin
    .from('scheduled_posts')
    .select('client_id')
    .gte('scheduled_at', new Date().toISOString())
    .lte('scheduled_at', sevenDays.toISOString())
    .in('status', ['scheduled', 'publishing']);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.client_id] = (counts[row.client_id] ?? 0) + 1;
  }
  return NextResponse.json({ counts });
}
```

- [ ] **Step 2:** Commit
```bash
git add app/api/calendar/scheduled-summary/route.ts
git commit -m "feat(calendar): scheduled-summary endpoint"
```

### Task 7.2: Wire green dot into brand pill

**Files:**
- Modify: `components/layout/admin-brand-pill.tsx`

- [ ] **Step 1:** Add a `useEffect` near the top that fetches `/api/calendar/scheduled-summary` on mount and every 60s. Cache in a `useState<Record<string, number>>`. Render a small dot inside the brand row JSX. Read the current file first to find the right insertion point.

```tsx
// near top of component
const [scheduleCounts, setScheduleCounts] = useState<Record<string, number>>({});
useEffect(() => {
  let alive = true;
  async function load() {
    try {
      const res = await fetch('/api/calendar/scheduled-summary');
      if (!res.ok) return;
      const data = await res.json();
      if (alive) setScheduleCounts(data.counts ?? {});
    } catch {}
  }
  load();
  const i = setInterval(load, 60000);
  return () => { alive = false; clearInterval(i); };
}, []);
```

In the brand row JSX (where each `b` is rendered), inject:

```tsx
{scheduleCounts[b.id] > 0 && (
  <span
    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
    title={`${scheduleCounts[b.id]} posts scheduled this week`}
  />
)}
```

Place it before the existing `<Check />` for active state.

- [ ] **Step 2:** Verify visually: brand with scheduled drop shows dot.

- [ ] **Step 3:** Commit
```bash
git add components/layout/admin-brand-pill.tsx
git commit -m "feat(calendar): green-dot indicator on brand pill"
```

### Phase 7 verification gate

- [ ] Brand with scheduled posts shows green dot
- [ ] Hover shows tooltip
- [ ] Other brands have no dot

---

## Phase 8 — Polish + sanity sweep

### Task 8.1: Build + types + lint

- [ ] **Step 1:** Run all three:
```bash
npm run lint
npx tsc --noEmit
npm run build
```
Fix any errors. Commit any fixes.

### Task 8.2: Visual QA against Ideas Hub

- [ ] **Step 1:** Open `/admin/calendar` and `/admin/ideas-hub` side by side. Compare:
  - Card padding/density (Ideas Hub: `px-3.5 py-2.5` for nested, `px-4 py-3` for headers)
  - Border radius (`rounded-xl` for outer, `rounded-lg` for nested)
  - Typography sizes (`text-sm font-semibold` headers, `text-xs` meta, `text-2xl font-semibold` H1)
  - Border colors (`border-nativz-border`)
  - Background tones (`bg-surface` cards, `bg-background` page)
  - Button styles (sentence case, no uppercase per `feedback_button_no_uppercase` memory; `whitespace-nowrap` per `feedback_buttons_never_wrap`)
- [ ] **Step 2:** Fix any mismatch. Commit.

### Task 8.3: End-to-end manual run

- [ ] **Step 1:** With a real client + Drive folder (use a test client with 3-5 short videos):
  - Create drop
  - Wait for ready
  - Inspect captions, edit one
  - Schedule
  - Confirm Zernio shows posts
  - Create share link
  - Open share link in incognito, leave a comment
  - Confirm comment shows in admin (refresh)
  - Confirm green dot on brand pill

### Task 8.4: Known follow-ups (capture as project memory)

Add a project memory entry pointing at this spec/plan and listing:
- Portal `/portal/calendar` view (read-only) — future
- Per-platform caption variants — future
- Admin view of share-link comments inline on drop detail — follow-up
- Drop retry endpoint (failed videos one-click retry) — follow-up
- Email/Slack notification on share-link comment — future

### Phase 8 verification gate

- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` clean
- [ ] Visual diff vs ideas hub: indistinguishable
- [ ] Full e2e flow works in browser
- [ ] Green dot indicator working
- [ ] Memory entry written

---

## Final ship gate

- [ ] All 8 phase gates above are green
- [ ] All changes committed and pushed to `main` (per `feedback_push_main_only`)
- [ ] Single end-to-end run with real videos completed successfully
- [ ] No `error_detail` populated on any drop or video in the test run
- [ ] Captions consistently score ≥80
