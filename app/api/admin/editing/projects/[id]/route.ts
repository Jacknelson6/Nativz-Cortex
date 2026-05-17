import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { teardownEditingProjectMedia } from '@/lib/editing/teardown-media';
import type { EditingProjectStatus } from '@/lib/editing/types';

export const dynamic = 'force-dynamic';

/**
 * GET    /api/admin/editing/projects/:id   one project + its videos
 * PATCH  /api/admin/editing/projects/:id   rename, retype, change status, set role assignments
 * DELETE /api/admin/editing/projects/:id   soft delete: flips status='archived',
 *                                          stamps archived_at, and tears down Mux
 *                                          assets + Supabase Storage objects for
 *                                          every video on the project. The row +
 *                                          child rows stay so the editor's consume
 *                                          history (credit_transactions) still
 *                                          resolves; only the heavy bytes go.
 *                                          ?hard=1 also drops the row + cascades.
 */

const PatchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    project_type: z.enum(['editing', 'calendar']).optional(),
    status: z
      .enum(['editing', 'need_approval', 'revising', 'approved', 'done', 'archived'])
      .optional(),
    editor_id: z.string().uuid().nullable().optional(),
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
       editor:team_members!editing_projects_editor_id_fkey(id, email, full_name, avatar_url),
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
    editor?: { email?: string | null; full_name?: string | null } | null;
    videographer?: { email?: string | null; full_name?: string | null } | null;
    strategist?: { email?: string | null; full_name?: string | null } | null;
    client?: { name?: string | null; slug?: string | null; logo_url?: string | null } | null;
  };
  const project = {
    ...r,
    client_name: r.client?.name ?? null,
    client_slug: r.client?.slug ?? null,
    client_logo_url: r.client?.logo_url ?? null,
    editor_email: r.editor?.email ?? null,
    editor_name: r.editor?.full_name ?? null,
    videographer_email: r.videographer?.email ?? null,
    videographer_name: r.videographer?.full_name ?? null,
    strategist_email: r.strategist?.email ?? null,
    strategist_name: r.strategist?.full_name ?? null,
  };

  // Run the child-row queries in parallel — independent reads that all
  // feed the detail panel on the same render. `scheduled_posts` is
  // pulled in too so the "Scheduled dates" section after a Promote-to-
  // calendar can render without a second round-trip.
  const [
    { data: videos },
    { data: rawVideos },
    { data: reviewComments },
    { data: scheduledPosts },
  ] = await Promise.all([
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
    // Walk newest-first so the first row we see for a given video_id wins.
    admin
      .from('editing_project_review_comments')
      .select('video_id, status, metadata, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('scheduled_posts')
      .select('id, title, scheduled_at, status, caption')
      .eq('editing_project_id', id)
      .order('scheduled_at', { ascending: true }),
  ]);

  // Derive a per-video review status: 'approved' | 'revising' | null.
  // Walk newest -> oldest per video; the first non-activity row determines state.
  type ReviewRow = {
    video_id: string | null;
    status: 'approved' | 'comment' | 'video_revised';
  };
  const reviewByVideo = new Map<string, 'approved' | 'revising'>();
  // Build per-video lists so we can apply latestReview logic.
  const commentsByVideo = new Map<string, ReviewRow[]>();
  for (const c of (reviewComments ?? []) as ReviewRow[]) {
    if (!c.video_id) continue;
    const list = commentsByVideo.get(c.video_id) ?? [];
    list.push(c);
    commentsByVideo.set(c.video_id, list);
  }
  for (const [videoId, rows] of commentsByVideo) {
    // rows are already newest-first from the query ORDER
    let lastApprovalIdx = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].status === 'approved') { lastApprovalIdx = i; break; }
    }
    let resolved: 'approved' | 'revising' | null = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const s = rows[i].status;
      if (s === 'video_revised') continue;
      if (s === 'approved') { resolved = 'approved'; break; }
      if (s === 'comment' && i > lastApprovalIdx) { resolved = 'revising'; break; }
    }
    if (resolved) reviewByVideo.set(videoId, resolved);
  }

  // Dedup by `position` slot, keeping only the latest revision (the
  // query above orders position ASC, version DESC, so the first row we
  // see per position is the freshest cut). Older versions stay in the
  // DB for history but should not inflate the dialog's deliverable
  // count — when a strategist replaces a v1 cut with v2, the
  // deliverable count should stay at N, not jump to 2N. Mirrors the
  // dedup in `/api/editing/share/[token]/route.ts`.
  const seenPositions = new Set<number>();
  const latestVideos = (videos ?? []).flatMap((v) => {
    const pos = (v.position as number | null) ?? 0;
    if (seenPositions.has(pos)) return [];
    seenPositions.add(pos);
    return [v];
  });

  const videosWithStatus = latestVideos.map((v) => ({
    ...v,
    review_status: reviewByVideo.get(v.id as string) ?? null,
  }));

  return NextResponse.json({
    project,
    videos: videosWithStatus,
    raw_videos: rawVideos ?? [],
    scheduled_posts: scheduledPosts ?? [],
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

  // Tear down Mux assets + Supabase Storage objects for every video on
  // the project. Both delete paths (soft + hard) get this so the heavy
  // bytes go either way. Best-effort: helper logs per-asset failures
  // and returns counts; the row flip / row drop runs regardless.
  const teardown = await teardownEditingProjectMedia(admin, id).catch((err) => {
    console.error(`[editing-delete] teardown threw for project ${id}:`, err);
    return { muxDeleted: 0, storageDeleted: 0, muxFailed: 0 };
  });

  if (!hard) {
    const { error } = await admin
      .from('editing_projects')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      return NextResponse.json({ error: 'archive_failed', detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, mode: 'archived', teardown });
  }

  // Hard delete: also drop the row + cascade child rows. teardownEditingProjectMedia
  // above already cleared storage + Mux, so this is the final tombstone step.
  const { error } = await admin.from('editing_projects').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: 'hard_deleted', teardown });
}
