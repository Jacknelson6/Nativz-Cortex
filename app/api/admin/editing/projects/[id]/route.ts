import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { deleteEditingObject } from '@/lib/editing/storage';
import type { EditingProjectStatus } from '@/lib/editing/types';

export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/editing/projects/:id   one project + its videos
 * PATCH  /api/admin/editing/projects/:id   rename, retype, change status, set assignee
 * DELETE /api/admin/editing/projects/:id   archive (soft delete) - flips status=archived,
 *                                          stamps archived_at, leaves rows + storage intact
 */

const PatchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    project_type: z
      .enum(['organic_content', 'social_ads', 'ctv_ads', 'general', 'other'])
      .optional(),
    status: z
      .enum(['editing', 'need_approval', 'revising', 'approved', 'done', 'archived'])
      .optional(),
    assignee_id: z.string().uuid().nullable().optional(),
    videographer_id: z.string().uuid().nullable().optional(),
    strategist_id: z.string().uuid().nullable().optional(),
    project_brief: z.string().max(8000).nullable().optional(),
    shoot_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
      .nullable()
      .optional(),
    drive_folder_url: z.string().url().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'no fields to update' });

const STATUS_TIMESTAMP_MAP: Record<EditingProjectStatus, string | null> = {
  editing: null,
  need_approval: 'ready_at',
  revising: null,
  approved: 'approved_at',
  done: 'scheduled_at',
  archived: 'archived_at',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from('editing_projects')
    .select(
      `*,
       client:clients!editing_projects_client_id_fkey(id, name, slug, logo_url),
       assignee:team_members!editing_projects_assignee_id_fkey(id, email, full_name, avatar_url),
       videographer:team_members!editing_projects_videographer_id_fkey(id, email, full_name, avatar_url),
       strategist:team_members!editing_projects_strategist_id_fkey(id, email, full_name, avatar_url)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Flatten the embedded role rows so the detail panel can read
  // `project.strategist_email`/`strategist_name` etc. directly,
  // matching the list-route shape (and the EditingProject type).
  const r = row as Record<string, unknown> & {
    assignee?: { email?: string | null; full_name?: string | null } | null;
    videographer?: { email?: string | null; full_name?: string | null } | null;
    strategist?: { email?: string | null; full_name?: string | null } | null;
    client?: { name?: string | null; slug?: string | null; logo_url?: string | null } | null;
  };
  const project = {
    ...r,
    client_name: r.client?.name ?? null,
    client_slug: r.client?.slug ?? null,
    client_logo_url: r.client?.logo_url ?? null,
    assignee_email: r.assignee?.email ?? null,
    assignee_name: r.assignee?.full_name ?? null,
    videographer_email: r.videographer?.email ?? null,
    videographer_name: r.videographer?.full_name ?? null,
    strategist_email: r.strategist?.email ?? null,
    strategist_name: r.strategist?.full_name ?? null,
  };

  // Run the two child-row queries in parallel — they're independent and
  // both feed the detail panel on the same render. Promise.all avoids
  // the round-trip stacking flagged in MEMORY.md.
  const [{ data: videos }, { data: rawVideos }] = await Promise.all([
    admin
      .from('editing_project_videos')
      .select('*')
      .eq('project_id', id)
      .order('position', { ascending: true })
      .order('version', { ascending: false }),
    admin
      .from('editing_project_raw_videos')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
  ]);

  return NextResponse.json({
    project,
    videos: videos ?? [],
    raw_videos: rawVideos ?? [],
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
  const update: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.status) {
    const stampField = STATUS_TIMESTAMP_MAP[parsed.data.status];
    if (stampField) update[stampField] = new Date().toISOString();
  }

  const { error } = await admin
    .from('editing_projects')
    .update(update)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const hard = url.searchParams.get('hard') === '1';

  const admin = createAdminClient();
  if (!hard) {
    const { error } = await admin
      .from('editing_projects')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      return NextResponse.json({ error: 'archive_failed', detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, mode: 'archived' });
  }

  // Hard delete: also try to clean up storage objects so the bucket
  // doesn't accumulate orphan files. Best-effort - if any individual
  // remove fails, the row delete still proceeds (cascade clears child
  // rows) and the file becomes orphan storage instead of an orphan row.
  const { data: videos } = await admin
    .from('editing_project_videos')
    .select('storage_path')
    .eq('project_id', id);
  for (const v of videos ?? []) {
    if (v.storage_path) {
      await deleteEditingObject(admin, v.storage_path).catch(() => {});
    }
  }

  const { error } = await admin.from('editing_projects').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: 'hard_deleted' });
}
