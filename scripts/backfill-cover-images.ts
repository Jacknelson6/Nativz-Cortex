/**
 * Backfill `scheduled_posts.cover_image_url` (and the underlying
 * `content_drop_videos.thumbnail_url`) for video posts that never got a
 * thumbnail stamped during ingestion.
 *
 * Why this exists: Drive-folder ingestion (`lib/calendar/ingest-drop.ts`)
 * tries to extract a first frame via ffmpeg-static and silently swallows
 * the error if it fails. The share-link download grid relies on
 * `cover_image_url` to render a thumbnail, so silent failures meant
 * paid-media teams landed on a wall of FileVideo placeholder icons (the
 * College Hunks May 2026 zip page was the trigger for this fix).
 *
 * Strategy (per post, in dependency order):
 *   1. If the linked `content_drop_videos` row already has a
 *      `thumbnail_url`, just copy it onto `scheduled_posts.cover_image_url`.
 *      No video bytes fetched. Cheapest path.
 *   2. Otherwise, pull the source video URL (drop_video.video_url, or fall
 *      back to scheduler_media.late_media_url for posts that aren't tied
 *      to a drop_video), fetch the bytes, run `extractFirstFrame`, upload
 *      to the `scheduler-thumbnails` bucket via `uploadThumbnail`, then
 *      stamp BOTH `drop_videos.thumbnail_url` AND
 *      `scheduled_posts.cover_image_url` so the next run can short-circuit
 *      to path 1.
 *
 * Skips image posts entirely (their thumbnail story lives on
 * content_drop_post_assets and doesn't have the same gap).
 *
 * Usage:
 *   npx tsx scripts/backfill-cover-images.ts                      # dry run, all clients
 *   npx tsx scripts/backfill-cover-images.ts --apply              # write, all clients
 *   npx tsx scripts/backfill-cover-images.ts --client "College Hunks" --apply
 *   npx tsx scripts/backfill-cover-images.ts --limit 5            # cap iteration count
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { extractFirstFrame } from '@/lib/calendar/thumbnail';
import { uploadThumbnail } from '@/lib/calendar/storage-upload';

interface Args {
  apply: boolean;
  client: string | null;
  limit: number | null;
}

function parseArgs(): Args {
  const a: Args = { apply: false, client: null, limit: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--apply') a.apply = true;
    else if (v === '--client') a.client = argv[++i] ?? null;
    else if (v === '--limit') a.limit = Number(argv[++i]);
  }
  return a;
}

interface CandidatePost {
  postId: string;
  clientName: string;
  dropVideoId: string | null;
  dropVideoThumb: string | null;
  dropVideoUrl: string | null;
  schedulerMediaUrl: string | null;
  dropId: string | null;
  mimeType: string | null;
  driveFileName: string | null;
}

async function loadCandidates(
  admin: SupabaseClient,
  args: Args,
): Promise<CandidatePost[]> {
  // Pull all video scheduled_posts with null cover_image_url, plus their
  // matched drop_video and scheduler_media rows. The Supabase JS client
  // can't easily express "join through scheduled_post_platforms ->
  // scheduler_media", so we do two passes and stitch in JS.
  let q = admin
    .from('scheduled_posts')
    .select(
      'id, client_id, post_type, cover_image_url, clients!inner(name)',
    )
    .is('cover_image_url', null)
    .neq('post_type', 'image')
    .neq('post_type', 'carousel');
  if (args.client) {
    q = q.ilike('clients.name', `%${args.client}%`);
  }
  if (args.limit) {
    q = q.limit(args.limit);
  }
  const { data: posts, error } = await q;
  if (error) throw new Error(`Posts query failed: ${error.message}`);

  type PostRow = {
    id: string;
    clients: { name: string } | null;
  };
  const postRows = (posts ?? []) as unknown as PostRow[];
  if (postRows.length === 0) return [];

  const postIds = postRows.map((p) => p.id);

  // Drop video link
  const { data: dropVideos } = await admin
    .from('content_drop_videos')
    .select('id, drop_id, scheduled_post_id, thumbnail_url, video_url, mime_type, drive_file_name')
    .in('scheduled_post_id', postIds);

  const dvByPost = new Map<string, {
    id: string;
    drop_id: string;
    thumbnail_url: string | null;
    video_url: string | null;
    mime_type: string | null;
    drive_file_name: string | null;
  }>();
  for (const dv of (dropVideos ?? [])) {
    const rec = dv as {
      id: string;
      drop_id: string;
      scheduled_post_id: string;
      thumbnail_url: string | null;
      video_url: string | null;
      mime_type: string | null;
      drive_file_name: string | null;
    };
    if (rec.scheduled_post_id) dvByPost.set(rec.scheduled_post_id, rec);
  }

  // Scheduler media fallback (for posts without a drop_video link)
  const { data: legs } = await admin
    .from('scheduled_post_platforms')
    .select('scheduled_post_id, scheduler_media_id')
    .in('scheduled_post_id', postIds);
  const mediaIds = Array.from(
    new Set(
      (legs ?? [])
        .map((l) => (l as { scheduler_media_id: string | null }).scheduler_media_id)
        .filter((x): x is string => !!x),
    ),
  );
  const mediaUrlById = new Map<string, string | null>();
  if (mediaIds.length > 0) {
    const { data: media } = await admin
      .from('scheduler_media')
      .select('id, late_media_url')
      .in('id', mediaIds);
    for (const m of (media ?? [])) {
      const rec = m as { id: string; late_media_url: string | null };
      mediaUrlById.set(rec.id, rec.late_media_url);
    }
  }
  const mediaByPost = new Map<string, string | null>();
  for (const l of (legs ?? [])) {
    const rec = l as { scheduled_post_id: string; scheduler_media_id: string | null };
    if (mediaByPost.has(rec.scheduled_post_id)) continue;
    if (!rec.scheduler_media_id) continue;
    mediaByPost.set(rec.scheduled_post_id, mediaUrlById.get(rec.scheduler_media_id) ?? null);
  }

  return postRows.map((p): CandidatePost => {
    const dv = dvByPost.get(p.id);
    return {
      postId: p.id,
      clientName: p.clients?.name ?? 'Unknown',
      dropVideoId: dv?.id ?? null,
      dropVideoThumb: dv?.thumbnail_url ?? null,
      dropVideoUrl: dv?.video_url ?? null,
      schedulerMediaUrl: mediaByPost.get(p.id) ?? null,
      dropId: dv?.drop_id ?? null,
      mimeType: dv?.mime_type ?? null,
      driveFileName: dv?.drive_file_name ?? null,
    };
  });
}

async function processPost(
  admin: SupabaseClient,
  cand: CandidatePost,
  apply: boolean,
): Promise<{ status: 'copied' | 'extracted' | 'skipped' | 'failed'; detail: string }> {
  // Path 1: drop_video already has a thumbnail — just copy.
  if (cand.dropVideoThumb) {
    if (apply) {
      const { error } = await admin
        .from('scheduled_posts')
        .update({ cover_image_url: cand.dropVideoThumb })
        .eq('id', cand.postId);
      if (error) return { status: 'failed', detail: `cover update: ${error.message}` };
    }
    return { status: 'copied', detail: cand.dropVideoThumb };
  }

  // Path 2: need to derive a thumbnail from source video.
  const videoUrl = cand.dropVideoUrl ?? cand.schedulerMediaUrl;
  if (!videoUrl) {
    return { status: 'skipped', detail: 'no video url on drop_video or scheduler_media' };
  }

  // Path 2a (cheap): Mux-backed video. The playback id is embedded in the
  // capped-1080p URL — `https://stream.mux.com/<playbackId>/capped-1080p.mp4`.
  // We can build a Mux-hosted thumbnail URL with zero bytes transferred and
  // stamp both tables. This covers the producer-Mux path that all current
  // calendar drops take.
  const muxMatch = videoUrl.match(
    /https:\/\/stream\.mux\.com\/([^/]+)\/capped-1080p\.mp4/,
  );
  if (muxMatch) {
    const playbackId = muxMatch[1];
    const muxThumb = `https://image.mux.com/${playbackId}/thumbnail.jpg?width=640&fit_mode=preserve&time=1`;
    if (!apply) {
      return { status: 'extracted', detail: `would stamp mux thumb (${playbackId.slice(0, 8)}…)` };
    }
    if (cand.dropVideoId) {
      const { error: dvErr } = await admin
        .from('content_drop_videos')
        .update({ thumbnail_url: muxThumb })
        .eq('id', cand.dropVideoId);
      if (dvErr) return { status: 'failed', detail: `drop_videos update: ${dvErr.message}` };
    }
    const { error: spErr } = await admin
      .from('scheduled_posts')
      .update({ cover_image_url: muxThumb })
      .eq('id', cand.postId);
    if (spErr) return { status: 'failed', detail: `cover update: ${spErr.message}` };
    return { status: 'extracted', detail: muxThumb };
  }

  if (!apply) {
    return { status: 'extracted', detail: `would extract from ${videoUrl}` };
  }

  // Need a dropId for the storage path. If the post has no drop_video link,
  // we can't run the upload (uploadThumbnail expects dropId + videoId), so
  // bail rather than inventing a path.
  if (!cand.dropId || !cand.dropVideoId) {
    return {
      status: 'skipped',
      detail: 'no drop_video link, scheduler_media-only posts not extractable via current storage layout',
    };
  }

  // Pull the bytes
  const res = await fetch(videoUrl);
  if (!res.ok) {
    return { status: 'failed', detail: `fetch ${res.status}` };
  }
  const buf = Buffer.from(await res.arrayBuffer());

  const ext = (cand.driveFileName?.split('.').pop() ?? 'mp4').toLowerCase();
  let frame: Buffer;
  try {
    frame = await extractFirstFrame(buf, ext);
  } catch (err) {
    return { status: 'failed', detail: `ffmpeg: ${err instanceof Error ? err.message : String(err)}` };
  }

  let thumbUrl: string;
  try {
    thumbUrl = await uploadThumbnail(admin, {
      dropId: cand.dropId,
      videoId: cand.dropVideoId,
      buffer: frame,
    });
  } catch (err) {
    return { status: 'failed', detail: `upload: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Stamp both tables so the next run takes path 1.
  const { error: dvErr } = await admin
    .from('content_drop_videos')
    .update({ thumbnail_url: thumbUrl })
    .eq('id', cand.dropVideoId);
  if (dvErr) return { status: 'failed', detail: `drop_videos update: ${dvErr.message}` };

  const { error: spErr } = await admin
    .from('scheduled_posts')
    .update({ cover_image_url: thumbUrl })
    .eq('id', cand.postId);
  if (spErr) return { status: 'failed', detail: `cover update: ${spErr.message}` };

  return { status: 'extracted', detail: thumbUrl };
}

async function main() {
  const args = parseArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  console.log(`[backfill-cover-images] mode=${args.apply ? 'APPLY' : 'DRY'} client=${args.client ?? 'ALL'} limit=${args.limit ?? 'none'}`);

  const candidates = await loadCandidates(admin, args);
  console.log(`[backfill-cover-images] ${candidates.length} candidate post(s)`);

  const counts = { copied: 0, extracted: 0, skipped: 0, failed: 0 };
  for (const cand of candidates) {
    const res = await processPost(admin, cand, args.apply);
    counts[res.status] += 1;
    const tag = res.status.toUpperCase().padEnd(9);
    console.log(`  ${tag} ${cand.clientName} ${cand.postId.slice(0, 8)} - ${res.detail}`);
  }

  console.log(`[backfill-cover-images] done. copied=${counts.copied} extracted=${counts.extracted} skipped=${counts.skipped} failed=${counts.failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
