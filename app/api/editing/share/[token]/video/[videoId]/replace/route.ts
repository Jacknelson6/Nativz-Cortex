import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMux } from '@/lib/mux/client';
import { requireAdminOnShare } from '@/lib/share/admin-gate';
import { logShareAdminAction } from '@/lib/share/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/editing/share/[token]/video/[videoId]/replace
 *
 * PRD 06: admin-only share-scoped re-upload of a cut. Mirrors the
 * existing admin route at /api/admin/editing/projects/:id/videos with
 * `replace_video_id`, but resolves the project from the share token so
 * the operator never leaves the share page. Mints a Mux direct-upload
 * URL; the browser PUTs bytes against it and the existing Mux webhook
 * reconciles the row state. The new row inherits the slot's `position`
 * and bumps `version`.
 */

const Body = z.object({
  filename: z.string().min(1).max(300),
  mime_type: z.string().min(1).max(100),
  size_bytes: z.number().int().nonnegative(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string; videoId: string }> },
) {
  const { token, videoId } = await ctx.params;

  const gate = await requireAdminOnShare(token);
  if (!gate.ok) return gate.response;
  const { context, identity } = gate;

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', detail: parsed.error.message },
      { status: 400 },
    );
  }
  if (!parsed.data.mime_type.startsWith('video/')) {
    return NextResponse.json(
      { error: 'only video mime types supported here' },
      { status: 415 },
    );
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('editing_project_share_links')
    .select('project_id')
    .eq('id', context.linkId)
    .single<{ project_id: string }>();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: prev } = await admin
    .from('editing_project_videos')
    .select('id, project_id, position, version')
    .eq('id', videoId)
    .maybeSingle<{ id: string; project_id: string; position: number; version: number }>();
  if (!prev || prev.project_id !== link.project_id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const headerOrigin = req.headers.get('origin');
  const corsOrigin =
    headerOrigin || process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  let upload;
  try {
    const mux = getMux();
    upload = await mux.video.uploads.create({
      cors_origin: corsOrigin,
      new_asset_settings: {
        playback_policies: ['public'],
        video_quality: 'basic',
        mp4_support: 'capped-1080p',
      },
    });
  } catch (err) {
    console.error('[share-replace-cut] Mux upload mint failed', {
      videoId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not start upload' },
      { status: 502 },
    );
  }

  const { data: row, error: insertErr } = await admin
    .from('editing_project_videos')
    .insert({
      project_id: prev.project_id,
      filename: parsed.data.filename,
      mime_type: parsed.data.mime_type,
      size_bytes: parsed.data.size_bytes,
      position: prev.position,
      version: prev.version + 1,
      uploaded_by: identity.userId,
      mux_upload_id: upload.id,
      mux_status: 'uploading',
    })
    .select('id')
    .single<{ id: string }>();
  if (insertErr || !row) {
    return NextResponse.json(
      { error: 'insert_failed', detail: insertErr?.message },
      { status: 500 },
    );
  }

  await admin
    .from('editing_projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', prev.project_id);

  await logShareAdminAction({
    shareLinkId: context.linkId,
    shareLinkKind: 'editing',
    actorUserId: identity.userId,
    action: 'content.replace',
    targetKind: 'video',
    targetId: videoId,
    payload: {
      new_video_id: row.id,
      filename: parsed.data.filename,
      version: prev.version + 1,
    },
  });

  return NextResponse.json({
    video_id: row.id,
    upload_id: upload.id,
    upload_url: upload.url,
  });
}
