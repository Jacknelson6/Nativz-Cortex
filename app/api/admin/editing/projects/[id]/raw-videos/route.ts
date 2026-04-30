import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import {
  createEditingUploadUrl,
  getEditingPublicUrl,
  sanitizeFilename,
} from '@/lib/editing/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/editing/projects/:id/raw-videos
 *
 * Sibling of the edited-video upload endpoint. Same two-step pattern:
 * insert a placeholder `editing_project_raw_videos` row, mint a Supabase
 * signed-upload URL, return the URL + token for direct browser PUT.
 *
 * Storage path prefix is `editing/<project_id>/raw/<raw_video_id>/<file>`
 * so raw clips never collide with edited cuts in the same bucket.
 *
 * No `replace_video_id` on raws. Raw footage is append-only - if the
 * videographer mis-uploads a clip they delete it via DELETE, then
 * re-upload as a fresh row.
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

  // Step 1: insert the row (placeholder storage_path so we have a uuid
  // to slot into the storage path).
  const { data: row, error } = await admin
    .from('editing_project_raw_videos')
    .insert({
      project_id: projectId,
      filename: parsed.data.filename,
      mime_type: parsed.data.mime_type,
      size_bytes: parsed.data.size_bytes,
      label: parsed.data.label ?? null,
      storage_path: 'pending',
      uploaded_by: user.id,
    })
    .select('id')
    .single();
  if (error || !row) {
    return NextResponse.json(
      { error: 'insert_failed', detail: error?.message },
      { status: 500 },
    );
  }

  const storagePath = `editing/${projectId}/raw/${row.id}/${sanitizeFilename(parsed.data.filename)}`;

  let signed;
  try {
    signed = await createEditingUploadUrl(admin, storagePath);
  } catch (err) {
    await admin.from('editing_project_raw_videos').delete().eq('id', row.id);
    return NextResponse.json(
      { error: 'sign_failed', detail: err instanceof Error ? err.message : 'sign failed' },
      { status: 502 },
    );
  }

  await admin
    .from('editing_project_raw_videos')
    .update({
      storage_path: signed.path,
      public_url: getEditingPublicUrl(admin, signed.path),
    })
    .eq('id', row.id);

  // Bump the parent project's updated_at so the videographer board
  // re-sorts and the editor sees fresh raws.
  await admin
    .from('editing_projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);

  return NextResponse.json({
    raw_video_id: row.id,
    storage_path: signed.path,
    signed_url: signed.signedUrl,
    upload_token: signed.token,
    bucket: 'editing-media',
    public_url: getEditingPublicUrl(admin, signed.path),
  });
}
