import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getMux } from '@/lib/mux/client';

const InitSchema = z.object({
  filename: z.string().min(1).max(200).optional(),
});

interface ShareLinkRow {
  id: string;
  drop_id: string;
  expires_at: string;
}

/**
 * POST /api/calendar/share/[token]/add-post/init
 *
 * Admin-only. First step of the public-share "+ Add new video" flow.
 *
 * Creates a fresh `content_drop_videos` row attached to this share link's
 * drop and mints a Mux direct-upload URL. The browser PUTs the video bytes to
 * Mux (bypassing Vercel's 4.5MB function body limit) and then calls
 * `/add-post/[videoId]/finalize` to flip the row into the analyze pipeline.
 *
 * Status flow for the row:
 *   pending → mux_uploading (this endpoint)
 *           → mux_processing (finalize)
 *           → analyzing → caption_pending → ready (analyze-from-mux helper,
 *              fired from the Mux static_renditions.ready webhook)
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = InitSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const filename = parsed.data.filename?.trim() || 'new-post.mp4';

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, expires_at')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  // Next order_index after the existing rows on this drop so list views keep
  // the new card pinned to the bottom until the editor schedules it onto a
  // specific day.
  const { data: maxRow } = await admin
    .from('content_drop_videos')
    .select('order_index')
    .eq('drop_id', link.drop_id)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle<{ order_index: number }>();
  const nextOrder = (maxRow?.order_index ?? -1) + 1;

  const headerOrigin = req.headers.get('origin');
  const origin =
    headerOrigin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(req.url).origin;

  let upload;
  try {
    const mux = getMux();
    upload = await mux.video.uploads.create({
      cors_origin: origin,
      new_asset_settings: {
        playback_policies: ['public'],
        video_quality: 'basic',
        mp4_support: 'capped-1080p',
      },
    });
  } catch (err) {
    console.error(
      `[add-post-init] Mux upload mint failed (cors_origin=${origin}):`,
      err,
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not start upload' },
      { status: 502 },
    );
  }

  // Insert the row first, then return the upload URL. status='mux_uploading'
  // is a new state — analyze sweeps gate on 'pending'/'analyzing'/'caption_pending'
  // so this row stays out of the bulk-Drive pipeline until the webhook flips
  // it. The browser is the only thing watching status on this row until then.
  const { data: video, error: insertErr } = await admin
    .from('content_drop_videos')
    .insert({
      drop_id: link.drop_id,
      drive_file_name: filename,
      order_index: nextOrder,
      status: 'mux_uploading',
      media_type: 'video',
      mux_upload_id: upload.id,
      mux_status: 'pending',
    })
    .select('id')
    .single<{ id: string }>();
  if (insertErr || !video) {
    return NextResponse.json(
      { error: insertErr?.message ?? 'Failed to create video row' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    videoId: video.id,
    uploadId: upload.id,
    uploadUrl: upload.url,
  });
}
