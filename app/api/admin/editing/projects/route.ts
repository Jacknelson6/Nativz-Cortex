import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import type { EditingProject } from '@/lib/editing/types';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/editing/projects
 *   Lists every non-archived editing project, joined with client name +
 *   logo + assignee email + a video_count rollup. The /admin/editing
 *   board calls this on load and after every mutation.
 *
 *   ?status=ready    only rows where status=in_review
 *   ?status=approved only rows where status=approved
 *   ?clientId=...    scope to one client
 *   ?include=archived also include archived rows
 *
 * POST /api/admin/editing/projects
 *   Creates a new project shell. The editor follows up with one or
 *   more `videos` POSTs to upload bytes.
 */

const ListQuery = z.object({
  status: z.enum(['draft', 'in_review', 'approved', 'scheduled', 'posted', 'archived']).optional(),
  clientId: z.string().uuid().optional(),
  include: z.enum(['archived']).optional(),
});

const CreateBody = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  project_type: z
    .enum(['organic_content', 'social_ads', 'ctv_ads', 'general', 'other'])
    .default('organic_content'),
  drive_folder_url: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const parsed = ListQuery.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', detail: parsed.error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin
    .from('editing_projects')
    .select(
      `id, client_id, name, project_type, status, assignee_id, drive_folder_url, notes,
       drop_id, created_by, created_at, updated_at, ready_at, approved_at,
       scheduled_at, archived_at,
       client:clients!editing_projects_client_id_fkey(name, slug, logo_url),
       assignee:users!editing_projects_assignee_id_fkey(email),
       videos:editing_project_videos(count)`,
    )
    .order('updated_at', { ascending: false });

  if (parsed.data.status) {
    query = query.eq('status', parsed.data.status);
  } else if (parsed.data.include !== 'archived') {
    query = query.neq('status', 'archived');
  }
  if (parsed.data.clientId) {
    query = query.eq('client_id', parsed.data.clientId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  }

  const projects: EditingProject[] = (data ?? []).map((row: any) => ({
    id: row.id,
    client_id: row.client_id,
    client_name: row.client?.name ?? null,
    client_slug: row.client?.slug ?? null,
    client_logo_url: row.client?.logo_url ?? null,
    name: row.name,
    project_type: row.project_type,
    status: row.status,
    assignee_id: row.assignee_id,
    assignee_email: row.assignee?.email ?? null,
    drive_folder_url: row.drive_folder_url,
    notes: row.notes,
    drop_id: row.drop_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ready_at: row.ready_at,
    approved_at: row.approved_at,
    scheduled_at: row.scheduled_at,
    archived_at: row.archived_at,
    video_count: Array.isArray(row.videos) ? row.videos[0]?.count ?? 0 : 0,
  }));

  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', detail: parsed.error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('editing_projects')
    .insert({
      client_id: parsed.data.client_id,
      name: parsed.data.name,
      project_type: parsed.data.project_type,
      drive_folder_url: parsed.data.drive_folder_url ?? null,
      notes: parsed.data.notes ?? null,
      created_by: user.id,
      assignee_id: user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'create_failed', detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
