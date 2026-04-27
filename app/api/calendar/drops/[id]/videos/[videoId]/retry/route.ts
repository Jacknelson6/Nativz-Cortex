import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestDrop } from '@/lib/calendar/ingest-drop';
import { analyzeDropVideos } from '@/lib/calendar/analyze-video';
import { generateDropCaptions } from '@/lib/calendar/generate-caption';
import type { DropVideoStatus } from '@/lib/types/calendar';

export const maxDuration = 300;

const IN_FLIGHT_VIDEO: DropVideoStatus[] = [
  'pending',
  'downloading',
  'analyzing',
  'caption_pending',
];

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const { id, videoId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: video } = await admin
    .from('content_drop_videos')
    .select('id, drop_id, status, video_url, gemini_context, draft_caption')
    .eq('id', videoId)
    .eq('drop_id', id)
    .single();

  if (!video) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (video.status !== 'failed') {
    return NextResponse.json(
      { error: 'video is not in failed state' },
      { status: 400 },
    );
  }

  const { data: drop } = await admin
    .from('content_drops')
    .select('id, client_id, created_by')
    .eq('id', id)
    .single();
  if (!drop) return NextResponse.json({ error: 'drop missing' }, { status: 404 });

  // Pick the earliest stage that hasn't completed for this video. Stage helpers
  // filter by status, so resetting to the earlier stage and running everything
  // forward is idempotent — successful videos at later stages are untouched.
  let resetTo: DropVideoStatus;
  if (!video.video_url) resetTo = 'pending';
  else if (!video.gemini_context) resetTo = 'analyzing';
  else resetTo = 'caption_pending';

  await admin
    .from('content_drop_videos')
    .update({ status: resetTo, error_detail: null })
    .eq('id', videoId);

  try {
    if (resetTo === 'pending') {
      await ingestDrop(admin, { dropId: id, userId: drop.created_by });
    }
    if (resetTo === 'pending' || resetTo === 'analyzing') {
      await analyzeDropVideos(admin, { dropId: id, userId: drop.created_by });
    }
    await generateDropCaptions(admin, {
      dropId: id,
      clientId: drop.client_id,
      userId: drop.created_by,
      userEmail: user.email ?? undefined,
    });
  } catch {
    // Helpers mark individual videos as failed; we still want to recompute the
    // drop status below before returning.
  }

  const { data: allVideos } = await admin
    .from('content_drop_videos')
    .select('status')
    .eq('drop_id', id);

  const statuses = ((allVideos ?? []) as { status: DropVideoStatus }[]).map((v) => v.status);
  const anyInFlight = statuses.some((s) => IN_FLIGHT_VIDEO.includes(s));
  const anyReady = statuses.some((s) => s === 'ready');
  const anyFailed = statuses.some((s) => s === 'failed');

  // If anything is still in-flight we leave the drop status alone; the next
  // poll will pick it up. Otherwise: ready beats failed (a partial-failure
  // drop is still schedulable for the working videos).
  if (!anyInFlight) {
    const nextStatus = anyReady ? 'ready' : 'failed';
    await admin
      .from('content_drops')
      .update({
        status: nextStatus,
        error_detail: anyFailed
          ? `${statuses.filter((s) => s === 'failed').length} video(s) remain in failed state`
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  }

  const { data: refreshed } = await admin
    .from('content_drop_videos')
    .select('*')
    .eq('id', videoId)
    .single();

  return NextResponse.json({ ok: true, video: refreshed });
}
