import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { deleteEditingObject } from '@/lib/editing/storage';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/admin/editing/projects/:id/raw-videos/:videoId
 *
 * Hard delete: drops the row and best-effort removes the underlying
 * storage object. No soft-delete flag on raw footage; if the
 * videographer says "this clip shouldn't be here" we want it gone so
 * the editor doesn't waste time scrubbing it.
 */
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
    .from('editing_project_raw_videos')
    .select('id, storage_path')
    .eq('id', videoId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (row.storage_path && row.storage_path !== 'pending') {
    await deleteEditingObject(admin, row.storage_path).catch(() => {});
  }

  const { error } = await admin
    .from('editing_project_raw_videos')
    .delete()
    .eq('id', videoId);
  if (error) {
    return NextResponse.json(
      { error: 'delete_failed', detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
