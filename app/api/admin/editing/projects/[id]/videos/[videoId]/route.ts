import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { deleteEditingObject } from '@/lib/editing/storage';

export const dynamic = 'force-dynamic';

/**
 * PATCH  /api/admin/editing/projects/:id/videos/:videoId
 *   Stamp metadata after a successful upload (duration_s, thumbnail_url),
 *   reorder via `position`, or rename. The browser hits this once the
 *   bytes finish uploading to the signed URL so the row reflects reality.
 *
 * DELETE /api/admin/editing/projects/:id/videos/:videoId
 *   Hard-delete the row + best-effort remove the storage object. Used
 *   when an editor scraps a clip entirely. Versioned re-uploads of the
 *   same slot use POST /videos with `replace_video_id` instead.
 */

const PatchBody = z
  .object({
    duration_s: z.number().nonnegative().optional(),
    thumbnail_url: z.string().url().nullable().optional(),
    position: z.number().int().nonnegative().optional(),
    filename: z.string().min(1).max(300).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'no fields to update' });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  const { id: projectId, videoId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', detail: parsed.error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('editing_project_videos')
    .update(parsed.data)
    .eq('id', videoId)
    .eq('project_id', projectId);
  if (error) {
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  }

  // Bump the project's updated_at so it re-sorts on the board.
  await admin
    .from('editing_projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  const { id: projectId, videoId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('editing_project_videos')
    .select('storage_path')
    .eq('id', videoId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (row.storage_path && row.storage_path !== 'pending') {
    await deleteEditingObject(admin, row.storage_path).catch(() => {});
  }

  const { error } = await admin
    .from('editing_project_videos')
    .delete()
    .eq('id', videoId)
    .eq('project_id', projectId);
  if (error) {
    return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 });
  }

  await admin
    .from('editing_projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);

  return NextResponse.json({ ok: true });
}
