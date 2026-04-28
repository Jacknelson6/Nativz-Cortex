/**
 * Shared end-to-end pipeline runner used by every scheduling script:
 * ingest → analyze → captions → schedule → optional share link.
 *
 * Both `scripts/schedule-skibell.ts` and `scripts/queue-from-monday.ts`
 * call this so the wire format and side-effects stay identical.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DriveVideoFile } from '@/lib/calendar/drive-folder';
import { ingestDrop } from '@/lib/calendar/ingest-drop';
import { analyzeDropVideos } from '@/lib/calendar/analyze-video';
import { generateDropCaptions } from '@/lib/calendar/generate-caption';
import { scheduleDrop } from '@/lib/calendar/schedule-drop';
import type { SocialPlatform } from '@/lib/posting';

export interface RunPipelineParams {
  label: string;
  folderUrl: string;
  videos: DriveVideoFile[];
  perVideoDates: string[]; // YYYY-MM-DD per video, same order
  defaultPostTimeCt: string; // 'HH:MM' wall-clock America/Chicago, e.g. '12:00'
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  platforms: SocialPlatform[];
  mintShareLink: boolean;
  draftMode: boolean;
  appUrl: string;
  clientId: string;
  userId: string;
  userEmail: string;
}

export interface RunPipelineResult {
  dropId?: string;
  shareUrl?: string;
  scheduled: number;
  failed: number;
  error?: string;
}

function chicagoWallClockUtc(yyyyMmDd: string, hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map((n) => parseInt(n, 10));
  const utcAtChosenWall = new Date(`${yyyyMmDd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const chicagoHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false })
      .format(utcAtChosenWall),
    10,
  );
  return new Date(utcAtChosenWall.getTime() + (hh - chicagoHour) * 60 * 60 * 1000).toISOString();
}

function step(label: string) {
  console.log(`    ── ${label} ──`);
}

export async function runCalendarPipeline(
  admin: SupabaseClient,
  params: RunPipelineParams,
): Promise<RunPipelineResult> {
  const {
    label,
    folderUrl,
    videos,
    perVideoDates,
    defaultPostTimeCt,
    startDate,
    endDate,
    platforms,
    mintShareLink,
    draftMode,
    appUrl,
    clientId,
    userId,
    userEmail,
  } = params;

  console.log(`\n  ▶ ${label}  (${videos.length} videos)`);

  const ordered = [...videos].sort((a, b) => a.name.localeCompare(b.name));
  if (ordered.length !== perVideoDates.length) {
    return {
      scheduled: 0,
      failed: 0,
      error: `count mismatch: ${ordered.length} videos vs ${perVideoDates.length} dates`,
    };
  }

  step('Insert content_drops + videos');
  const folderId = folderUrl.match(/folders\/([^/?]+)/)?.[1] ?? '';
  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .insert({
      client_id: clientId,
      created_by: userId,
      drive_folder_url: folderUrl,
      drive_folder_id: folderId,
      start_date: startDate,
      end_date: endDate,
      default_post_time: defaultPostTimeCt,
      total_videos: ordered.length,
      status: 'ingesting',
    })
    .select('id')
    .single<{ id: string }>();
  if (dropErr || !drop) {
    return { scheduled: 0, failed: 0, error: `content_drops insert: ${dropErr?.message ?? 'unknown'}` };
  }

  const videoRows = ordered.map((v, idx) => ({
    drop_id: drop.id,
    drive_file_id: v.id,
    drive_file_name: v.name,
    mime_type: v.mimeType,
    size_bytes: v.size,
    order_index: idx,
    status: 'pending',
  }));
  const { data: insertedVideos, error: vidErr } = await admin
    .from('content_drop_videos')
    .insert(videoRows)
    .select('id, order_index');
  if (vidErr || !insertedVideos) {
    return { dropId: drop.id, scheduled: 0, failed: 0, error: `content_drop_videos insert: ${vidErr?.message ?? 'unknown'}` };
  }

  const overrides: Record<string, string> = {};
  for (const row of insertedVideos as { id: string; order_index: number }[]) {
    const date = perVideoDates[row.order_index];
    overrides[row.id] = chicagoWallClockUtc(date, defaultPostTimeCt);
  }

  step('Ingest');
  const ingest = await ingestDrop(admin, { dropId: drop.id, userId });
  console.log(`      processed=${ingest.processed} failed=${ingest.failed}`);
  if (ingest.processed === 0) {
    await admin.from('content_drops').update({ status: 'failed', error_detail: 'all ingests failed' }).eq('id', drop.id);
    return { dropId: drop.id, scheduled: 0, failed: 0, error: 'All ingests failed' };
  }
  await admin
    .from('content_drops')
    .update({
      status: 'analyzing',
      processed_videos: ingest.processed,
      error_detail: ingest.failed > 0 ? `${ingest.failed} ingest failures` : null,
    })
    .eq('id', drop.id);

  step('Analyze');
  const analysis = await analyzeDropVideos(admin, { dropId: drop.id, userId });
  console.log(`      analyzed=${analysis.analyzed} failed=${analysis.failed}`);
  if (analysis.analyzed === 0) {
    await admin.from('content_drops').update({ status: 'failed', error_detail: 'all analyses failed' }).eq('id', drop.id);
    return { dropId: drop.id, scheduled: 0, failed: 0, error: 'All analyses failed' };
  }
  await admin
    .from('content_drops')
    .update({
      status: 'generating',
      error_detail: analysis.failed > 0 ? `${analysis.failed} analysis failures` : null,
    })
    .eq('id', drop.id);

  step('Generate captions');
  const captions = await generateDropCaptions(admin, {
    dropId: drop.id,
    clientId,
    userId,
    userEmail,
  });
  console.log(`      generated=${captions.generated} failed=${captions.failed}`);
  if (captions.generated === 0) {
    await admin.from('content_drops').update({ status: 'failed', error_detail: 'all captions failed' }).eq('id', drop.id);
    return { dropId: drop.id, scheduled: 0, failed: 0, error: 'All caption generations failed' };
  }
  await admin
    .from('content_drops')
    .update({
      status: 'ready',
      error_detail: captions.failed > 0 ? `${captions.failed} caption failures` : null,
    })
    .eq('id', drop.id);

  step(draftMode ? 'Schedule (draft — awaiting approval)' : 'Schedule via Zernio');
  const sched = await scheduleDrop(admin, {
    dropId: drop.id,
    platforms,
    overrides,
    draftMode,
  });
  console.log(`      scheduled=${sched.scheduled} failed=${sched.failed}`);

  let shareUrl: string | undefined;
  if (mintShareLink && sched.scheduled > 0) {
    step('Mint share link');
    const { data: scheduledVideos } = await admin
      .from('content_drop_videos')
      .select('scheduled_post_id')
      .eq('drop_id', drop.id)
      .not('scheduled_post_id', 'is', null);
    const postIds = (scheduledVideos ?? [])
      .map((v) => v.scheduled_post_id as string | null)
      .filter((p): p is string => typeof p === 'string');

    if (postIds.length > 0) {
      const { data: reviewLinks } = await admin
        .from('post_review_links')
        .insert(postIds.map((postId) => ({ post_id: postId })))
        .select('id, post_id');
      const reviewMap: Record<string, string> = {};
      for (const rl of reviewLinks ?? []) reviewMap[rl.post_id as string] = rl.id as string;

      const { data: shareLink } = await admin
        .from('content_drop_share_links')
        .insert({
          drop_id: drop.id,
          included_post_ids: postIds,
          post_review_link_map: reviewMap,
        })
        .select('token')
        .single<{ token: string }>();
      if (shareLink) shareUrl = `${appUrl}/c/${shareLink.token}`;
    }
  }

  return { dropId: drop.id, shareUrl, scheduled: sched.scheduled, failed: sched.failed };
}

export function eachDay(start: string, end: string): string[] {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  const MS = 24 * 60 * 60 * 1000;
  const days = Math.floor((b.getTime() - a.getTime()) / MS) + 1;
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(a.getTime() + i * MS);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  });
}

/**
 * Pick `count` evenly-spread items from `pool`, preserving order. Used to map
 * N videos onto N dates inside a calendar window.
 */
export function pickEven<T>(pool: T[], count: number): T[] {
  if (count <= 0) return [];
  if (count >= pool.length) return pool.slice();
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = count === 1 ? 0 : Math.round((i * (pool.length - 1)) / (count - 1));
    out.push(pool[idx]);
  }
  return out;
}
