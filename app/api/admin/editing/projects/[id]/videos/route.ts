import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import {
  buildEditingStoragePath,
  createEditingUploadUrl,
  getEditingPublicUrl,
} from '@/lib/editing/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/editing/projects/:id/videos
 *
 * Two-step upload pattern:
 *   1. Client POSTs `{ filename, mime_type, size_bytes, position }`.
 *      Server inserts a placeholder `editing_project_videos` row with
 *      `storage_path` pre-computed, then returns a one-shot Supabase
 *      signed-upload URL + token.
 *   2. Client PUTs bytes directly to the signed URL via
 *      `uploadToSignedUrl(path, token, file)`. No bytes ever touch
 *      Vercel Functions, so 50MB Function-body limits don't apply.
 *
 * On retry / re-upload of the same filename, the client sends
 * `replaceVideoId` to overwrite that row's storage path + bump version.
 */

const CreateVideoBody = z.object({
  filename: z.string().min(1).max(300),
  mime_type: z.string().min(1).max(100),
  size_bytes: z.number().int().nonnegative(),
  position: z.number().int().nonnegative().default(0),
  /** When set, mark the video as a new revision of an existing one
   *  (bumps version, keeps the slot/position). Original file stays in
   *  storage so we have history. */
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
    .select('id, status')
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

  // 1. Insert the row first so we have a uuid to use in the path.
  const { data: row, error } = await admin
    .from('editing_project_videos')
    .insert({
      project_id: projectId,
      filename: parsed.data.filename,
      mime_type: parsed.data.mime_type,
      size_bytes: parsed.data.size_bytes,
      position,
      version,
      storage_path: 'pending',
      uploaded_by: user.id,
    })
    .select('id')
    .single();
  if (error || !row) {
    return NextResponse.json({ error: 'insert_failed', detail: error?.message }, { status: 500 });
  }

  const storagePath = buildEditingStoragePath({
    projectId,
    videoId: row.id,
    filename: parsed.data.filename,
  });

  let signed;
  try {
    signed = await createEditingUploadUrl(admin, storagePath);
  } catch (err) {
    // Roll back the placeholder so we don't leave a "pending" row.
    await admin.from('editing_project_videos').delete().eq('id', row.id);
    return NextResponse.json(
      { error: 'sign_failed', detail: err instanceof Error ? err.message : 'sign failed' },
      { status: 502 },
    );
  }

  await admin
    .from('editing_project_videos')
    .update({
      storage_path: signed.path,
      public_url: getEditingPublicUrl(admin, signed.path),
    })
    .eq('id', row.id);

  // Auto-flip the project from draft -> draft (no-op) but stamp
  // updated_at via the trigger so the editing board re-sorts.
  await admin
    .from('editing_projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);

  return NextResponse.json({
    video_id: row.id,
    storage_path: signed.path,
    signed_url: signed.signedUrl,
    upload_token: signed.token,
    bucket: 'editing-media',
    public_url: getEditingPublicUrl(admin, signed.path),
  });
}
