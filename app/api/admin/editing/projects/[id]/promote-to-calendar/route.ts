import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { generateCaptionsForScheduledPosts } from '@/lib/editing/generate-captions-for-posts';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/editing/projects/:id/promote-to-calendar
 *
 * Convert an editing project's latest video per `position` into draft
 * scheduled_posts on the content calendar. Mirrors each Mux asset into
 * a `scheduler_media` row (capped-1080p.mp4 URL when Mux is ready) so
 * Zernio can publish without re-uploading.
 *
 * Distributes the posts across weekdays in the requested date range
 * using the client's default posting time (falls back to 10:00 America/
 * Chicago). Posts land as `status='draft'` with `scheduled_at` set so
 * they appear on the calendar grid; Jack approves to flip them live.
 *
 * Captions are filled in asynchronously by a thumbnail-only OpenRouter
 * pass kicked off via `after()`. The response returns as soon as the
 * rows land so the UI can navigate immediately.
 */

const BodySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  post_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

function eachWeekday(start: string, end: string): string[] {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  const MS = 24 * 60 * 60 * 1000;
  const out: string[] = [];
  for (let t = a.getTime(); t <= b.getTime(); t += MS) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    );
  }
  return out;
}

function pickEven<T>(pool: T[], count: number): T[] {
  if (count <= 0) return [];
  if (count >= pool.length) return pool.slice();
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = count === 1 ? 0 : Math.round((i * (pool.length - 1)) / (count - 1));
    out.push(pool[idx]);
  }
  return out;
}

function wallClockUtc(yyyyMmDd: string, hhmm: string, timeZone: string): string {
  const [hh, mm] = hhmm.split(':').map((n) => parseInt(n, 10));
  const naiveUtc = new Date(
    `${yyyyMmDd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`,
  );
  const tzHour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(naiveUtc),
    10,
  );
  return new Date(naiveUtc.getTime() + (hh - tzHour) * 60 * 60 * 1000).toISOString();
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', detail: parsed.error.message },
      { status: 400 },
    );
  }
  const { start_date, end_date, post_time } = parsed.data;
  if (start_date > end_date) {
    return NextResponse.json(
      { error: 'bad_request', detail: 'start_date must be on or before end_date' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: project, error: projectError } = await admin
    .from('editing_projects')
    .select(
      `id, client_id, name, promoted_at,
       client:clients!editing_projects_client_id_fkey(id, default_posting_time, default_posting_timezone)`,
    )
    .eq('id', id)
    .maybeSingle<{
      id: string;
      client_id: string;
      name: string;
      promoted_at: string | null;
      client: {
        id: string;
        default_posting_time: string | null;
        default_posting_timezone: string | null;
      } | null;
    }>();
  if (projectError)
    return NextResponse.json(
      { error: 'db_error', detail: projectError.message },
      { status: 500 },
    );
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (project.promoted_at) {
    return NextResponse.json(
      { error: 'already_promoted', detail: 'project has already been promoted to the calendar' },
      { status: 409 },
    );
  }

  const { data: videos, error: videosError } = await admin
    .from('editing_project_videos')
    .select(
      'id, filename, title, position, version, mux_asset_id, mux_playback_id, mux_status, thumbnail_url, duration_s, size_bytes, mime_type',
    )
    .eq('project_id', id)
    .order('position', { ascending: true })
    .order('version', { ascending: false });
  if (videosError)
    return NextResponse.json(
      { error: 'db_error', detail: videosError.message },
      { status: 500 },
    );

  type VideoRow = NonNullable<typeof videos>[number];
  const latestPerPosition: VideoRow[] = [];
  const seen = new Set<number>();
  for (const v of videos ?? []) {
    if (seen.has(v.position)) continue;
    seen.add(v.position);
    latestPerPosition.push(v);
  }

  if (latestPerPosition.length === 0) {
    return NextResponse.json(
      { error: 'no_videos', detail: 'project has no videos to promote' },
      { status: 400 },
    );
  }

  const weekdays = eachWeekday(start_date, end_date);
  if (weekdays.length < latestPerPosition.length) {
    return NextResponse.json(
      {
        error: 'window_too_short',
        detail: `Window ${start_date}..${end_date} has ${weekdays.length} weekdays but project has ${latestPerPosition.length} videos.`,
      },
      { status: 400 },
    );
  }
  const perVideoDates = pickEven(weekdays, latestPerPosition.length);
  const timeZone = project.client?.default_posting_timezone ?? 'America/Chicago';
  const timeOfDay = (post_time ?? project.client?.default_posting_time ?? '10:00').slice(0, 5);

  const mediaRows = latestPerPosition.map((v) => {
    const mp4Url =
      v.mux_status === 'ready' && v.mux_playback_id
        ? `https://stream.mux.com/${v.mux_playback_id}/capped-1080p.mp4`
        : null;
    return {
      client_id: project.client_id,
      uploaded_by: user.id,
      filename: v.filename ?? v.title ?? 'untitled.mp4',
      storage_path: v.mux_playback_id
        ? `mux:${v.mux_playback_id}`
        : `editing:${v.id}`,
      thumbnail_url: v.thumbnail_url,
      duration_seconds: v.duration_s,
      file_size_bytes: v.size_bytes,
      mime_type: v.mime_type ?? 'video/mp4',
      mux_asset_id: v.mux_asset_id,
      mux_playback_id: v.mux_playback_id,
      mux_status: v.mux_status,
      late_media_url: mp4Url,
      is_used: true,
    };
  });

  const { data: insertedMedia, error: mediaError } = await admin
    .from('scheduler_media')
    .insert(mediaRows)
    .select('id');
  if (mediaError || !insertedMedia)
    return NextResponse.json(
      { error: 'media_insert_failed', detail: mediaError?.message },
      { status: 500 },
    );

  const postRows = latestPerPosition.map((v, idx) => ({
    client_id: project.client_id,
    created_by: user.id,
    editing_project_id: project.id,
    status: 'draft' as const,
    caption: '',
    title: v.title ?? v.filename ?? null,
    post_type: 'reel' as const,
    scheduled_at: wallClockUtc(perVideoDates[idx], timeOfDay, timeZone),
  }));

  const { data: insertedPosts, error: postsError } = await admin
    .from('scheduled_posts')
    .insert(postRows)
    .select('id');
  if (postsError || !insertedPosts) {
    await admin
      .from('scheduler_media')
      .delete()
      .in(
        'id',
        insertedMedia.map((m) => m.id),
      );
    return NextResponse.json(
      { error: 'posts_insert_failed', detail: postsError?.message },
      { status: 500 },
    );
  }

  const linkRows = insertedPosts.map((post, idx) => ({
    post_id: post.id,
    media_id: insertedMedia[idx].id,
    sort_order: 0,
  }));

  const { error: linkError } = await admin
    .from('scheduled_post_media')
    .insert(linkRows);
  if (linkError) {
    await admin
      .from('scheduled_posts')
      .delete()
      .in(
        'id',
        insertedPosts.map((p) => p.id),
      );
    await admin
      .from('scheduler_media')
      .delete()
      .in(
        'id',
        insertedMedia.map((m) => m.id),
      );
    return NextResponse.json(
      { error: 'link_insert_failed', detail: linkError.message },
      { status: 500 },
    );
  }

  await admin
    .from('editing_projects')
    .update({ promoted_at: new Date().toISOString() })
    .eq('id', project.id);

  const postIds = insertedPosts.map((p) => p.id);

  // Captioning runs after the response returns. OpenRouter latency is the
  // long pole; the user doesn't need to wait — drafts already show on the
  // calendar with empty captions and fill in within ~60s.
  after(async () => {
    try {
      const { data: cortexUser } = await admin
        .from('users')
        .select('email')
        .eq('id', user.id)
        .maybeSingle<{ email: string | null }>();
      await generateCaptionsForScheduledPosts(admin, {
        postIds,
        clientId: project.client_id,
        userId: user.id,
        userEmail: cortexUser?.email ?? undefined,
      });
    } catch (err) {
      console.error('[promote-to-calendar] background captioning failed', err);
    }
  });

  return NextResponse.json({
    client_id: project.client_id,
    post_count: insertedPosts.length,
    post_ids: postIds,
  });
}
