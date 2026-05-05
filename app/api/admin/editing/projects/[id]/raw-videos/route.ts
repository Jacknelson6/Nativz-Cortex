import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getMux } from '@/lib/mux/client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/editing/projects/:id/raw-videos
 *
 * Sibling of the edited-video upload endpoint. Mints a Mux direct-upload
 * URL and inserts a placeholder `editing_project_raw_videos` row stamped
 * with `mux_upload_id` + `mux_status='uploading'`. Browser PUTs bytes
 * directly to Mux; the webhook fills in asset/playback ids later.
 *
 * No `replace_video_id` here — raw footage is append-only. If the
 * videographer mis-uploads a clip they DELETE then re-upload as a new row.
 */

const CreateRawVideoBody = z.object({
  filename: z.string().min(1).max(300),
  mime_type: z.string().min(1).max(100),
  size_bytes: z.number().int().nonnegative(),
  label: z.string().max(200).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = CreateRawVideoBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: project } = await admin
    .from('editing_projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'project_not_found' }, { status: 404 });

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
    console.error(`Mux raw upload mint failed (cors_origin=${corsOrigin}, project=${projectId}):`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not start upload' },
      { status: 502 },
    );
  }

  const { data: row, error } = await admin
    .from('editing_project_raw_videos')
    .insert({
      project_id: projectId,
      filename: parsed.data.filename,
      mime_type: parsed.data.mime_type,
      size_bytes: parsed.data.size_bytes,
      label: parsed.data.label ?? null,
      uploaded_by: user.id,
      mux_upload_id: upload.id,
      mux_status: 'uploading',
    })
    .select('id')
    .single();
  if (error || !row) {
    return NextResponse.json(
      { error: 'insert_failed', detail: error?.message },
      { status: 500 },
    );
  }

  await admin
    .from('editing_projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);

  return NextResponse.json({
    raw_video_id: row.id,
    upload_id: upload.id,
    upload_url: upload.url,
  });
}
