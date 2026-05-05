import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getMux } from '@/lib/mux/client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/editing/projects/:id/videos
 *
 * Inserts a placeholder `editing_project_videos` row, mints a Mux
 * direct-upload URL, and stamps `mux_upload_id` + `mux_status='uploading'`
 * on the row so the webhook can reconcile the asset back to it later.
 *
 * The browser PUTs the file bytes directly to Mux (bypassing Vercel's
 * 4.5MB Function body limit). On success the asset.created /
 * asset.ready webhooks fill in `mux_asset_id` / `mux_playback_id`. The
 * share-page consumer also self-heals via the pull reconciler if the
 * webhook is delayed.
 *
 * On retry / re-upload the client sends `replace_video_id` to keep the
 * slot/position but bump `version`. Original row is left intact for
 * history (and to avoid storage churn — the old Mux asset can be GC'd
 * later if we care).
 */

const CreateVideoBody = z.object({
  filename: z.string().min(1).max(300),
  mime_type: z.string().min(1).max(100),
  size_bytes: z.number().int().nonnegative(),
  position: z.number().int().nonnegative().default(0),
  replace_video_id: z.string().uuid().optional(),
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
  const parsed = CreateVideoBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', detail: parsed.error.message }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: project } = await admin
    .from('editing_projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'project_not_found' }, { status: 404 });

  let version = 1;
  let position = parsed.data.position;
  if (parsed.data.replace_video_id) {
    const { data: prev } = await admin
      .from('editing_project_videos')
      .select('version, position')
      .eq('id', parsed.data.replace_video_id)
      .maybeSingle();
    if (prev) {
      version = prev.version + 1;
      position = prev.position;
    }
  }

  // CORS origin — Mux's preflight check on the PUT compares the browser's
  // origin to whatever we register. Prefer the inbound `Origin` header
  // (the exact value the browser will send); fall back to NEXT_PUBLIC_APP_URL,
  // then a synthetic origin from req.url. See SMM mux-upload route for the
  // longer write-up — same constraint applies here.
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
        // Capped 1080p MP4 rendition matches the SMM flow. Keeps the
        // door open for an editing-side download/export of the cut.
        mp4_support: 'capped-1080p',
      },
    });
  } catch (err) {
    console.error(`Mux upload mint failed (cors_origin=${corsOrigin}, project=${projectId}):`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not start upload' },
      { status: 502 },
    );
  }

  const { data: row, error } = await admin
    .from('editing_project_videos')
    .insert({
      project_id: projectId,
      filename: parsed.data.filename,
      mime_type: parsed.data.mime_type,
      size_bytes: parsed.data.size_bytes,
      position,
      version,
      uploaded_by: user.id,
      mux_upload_id: upload.id,
      mux_status: 'uploading',
    })
    .select('id')
    .single();
  if (error || !row) {
    return NextResponse.json({ error: 'insert_failed', detail: error?.message }, { status: 500 });
  }

  // Bump updated_at so the editing board re-sorts.
  await admin
    .from('editing_projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);

  return NextResponse.json({
    video_id: row.id,
    upload_id: upload.id,
    upload_url: upload.url,
  });
}
