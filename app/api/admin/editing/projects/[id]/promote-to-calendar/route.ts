import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/editing/projects/:id/promote-to-calendar
 *
 * Convert an editing project's latest video per `position` into draft
 * scheduled_posts on the content calendar. Mirrors each Mux asset into
 * a `scheduler_media` row (capped-1080p.mp4 URL when Mux is ready) so
 * Zernio can publish without re-uploading.
 *
 * Posts are created with status='draft', no caption, no scheduled_at,
 * no platform targets — the user fills those in on /calendar.
 */
export async function POST(
  _req: Request,
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

  const admin = createAdminClient();

  const { data: project, error: projectError } = await admin
    .from('editing_projects')
    .select('id, client_id, name')
    .eq('id', id)
    .maybeSingle();
  if (projectError)
    return NextResponse.json(
      { error: 'db_error', detail: projectError.message },
      { status: 500 },
    );
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Latest version per position. The editing-project detail panel orders
  // identically; keep the first row for each position bucket.
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

  // Insert scheduler_media rows in one shot, then scheduled_posts, then
  // scheduled_post_media — three round trips total instead of 3*N.
  const mediaRows = latestPerPosition.map((v) => {
    const mp4Url =
      v.mux_status === 'ready' && v.mux_playback_id
        ? `https://stream.mux.com/${v.mux_playback_id}/capped-1080p.mp4`
        : null;
    return {
      client_id: project.client_id,
      uploaded_by: user.id,
      filename: v.filename ?? v.title ?? 'untitled.mp4',
      // storage_path is NOT NULL but only consulted as a fallback when
      // late_media_url is missing. Stamp a synthetic mux:// pointer so
      // resolve-media doesn't try to fetch a Supabase storage object.
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

  const postRows = latestPerPosition.map((v) => ({
    client_id: project.client_id,
    created_by: user.id,
    status: 'draft' as const,
    caption: '',
    title: v.title ?? v.filename ?? null,
    post_type: 'reel' as const,
  }));

  const { data: insertedPosts, error: postsError } = await admin
    .from('scheduled_posts')
    .insert(postRows)
    .select('id');
  if (postsError || !insertedPosts) {
    // Roll back the media rows so a retry doesn't double-insert.
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

  return NextResponse.json({
    client_id: project.client_id,
    post_count: insertedPosts.length,
    post_ids: insertedPosts.map((p) => p.id),
  });
}
