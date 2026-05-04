import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import type { EditingProjectVideo } from '@/lib/editing/types';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/calendar/share/[token]/editing-project
 *   Returns the editing-project row (if any) bridged to this share's
 *   `drop_id`, plus its uploaded videos. Used by CalendarLinkDetail to
 *   render the "Edited videos" Section without forcing the admin to
 *   bounce through /admin/editing first.
 *
 *   `{ project: null, videos: [] }` when no editing project has been
 *   created for this drop yet — the dialog uses that to render the
 *   empty drop-zone state.
 *
 * POST /api/calendar/share/[token]/editing-project
 *   Find-or-create. If a row already exists with `drop_id` equal to the
 *   share's drop_id, return its id. Otherwise create one (name derived
 *   from the drop's date range) and return the new id. The frontend
 *   calls this lazily on the first file drop so we don't spam the table
 *   with empty editing projects for every share dialog open.
 *
 * Admin-only — same gate as the rest of /api/calendar/share/[token]/*.
 */

interface DropRow {
  id: string;
  client_id: string;
  start_date: string;
  end_date: string;
}

async function loadDrop(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
): Promise<DropRow | null> {
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('drop_id')
    .eq('token', token)
    .single<{ drop_id: string }>();
  if (!link) return null;

  const { data: drop } = await admin
    .from('content_drops')
    .select('id, client_id, start_date, end_date')
    .eq('id', link.drop_id)
    .single<DropRow>();
  return drop ?? null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();
  const drop = await loadDrop(admin, token);
  if (!drop) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { data: project } = await admin
    .from('editing_projects')
    .select('id, name, status')
    .eq('drop_id', drop.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ project: null, videos: [] });
  }

  // Mirror the per-video review_status derivation from
  // /api/admin/editing/projects/[id] so the shared EditedVideosBox
  // renders the same Approved / Needs changes pills here.
  const [{ data: videos }, { data: reviewComments }] = await Promise.all([
    admin
      .from('editing_project_videos')
      .select('*')
      .eq('project_id', project.id)
      .order('position', { ascending: true })
      .order('version', { ascending: false }),
    admin
      .from('editing_project_review_comments')
      .select('video_id, status, metadata, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false }),
  ]);

  type ReviewRow = {
    video_id: string | null;
    status: 'approved' | 'changes_requested' | 'comment' | 'video_revised';
    metadata: Record<string, unknown> | null;
  };
  const reviewByVideo = new Map<string, 'approved' | 'changes_requested'>();
  for (const c of (reviewComments ?? []) as ReviewRow[]) {
    if (!c.video_id || reviewByVideo.has(c.video_id)) continue;
    if (c.status === 'comment' || c.status === 'video_revised') continue;
    if (
      c.status === 'changes_requested' &&
      (c.metadata as { resolved?: boolean } | null)?.resolved
    ) {
      continue;
    }
    reviewByVideo.set(c.video_id, c.status);
  }

  const videosWithStatus: EditingProjectVideo[] = (videos ?? []).map(
    (v) => ({
      ...(v as EditingProjectVideo),
      review_status: reviewByVideo.get(v.id as string) ?? null,
    }),
  );

  return NextResponse.json({
    project: { id: project.id, name: project.name, status: project.status },
    videos: videosWithStatus,
  });
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();
  const drop = await loadDrop(admin, token);
  if (!drop) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { data: existing } = await admin
    .from('editing_projects')
    .select('id')
    .eq('drop_id', drop.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ id: existing.id, created: false });
  }

  // Default name uses the drop's date range so the project is
  // recognizable on the editing board without the admin renaming it.
  const name = formatDropName(drop.start_date, drop.end_date);

  // Match the create flow used by POST /api/admin/editing/projects:
  // resolve the current admin to a team_members row so the project has
  // a sensible default assignee instead of falling to NULL.
  const { data: teamRow } = await admin
    .from('team_members')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await admin
    .from('editing_projects')
    .insert({
      client_id: drop.client_id,
      drop_id: drop.id,
      name,
      project_type: 'organic_content',
      created_by: user.id,
      assignee_id: (teamRow?.id as string | undefined) ?? null,
    })
    .select('id')
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: 'create_failed', detail: error?.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ id: created.id, created: true }, { status: 201 });
}

function formatDropName(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sM = s.toLocaleString('default', { month: 'short' });
  const eM = e.toLocaleString('default', { month: 'short' });
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${sM} ${s.getDate()} to ${e.getDate()}, ${s.getFullYear()}`;
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${sM} ${s.getDate()} to ${eM} ${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${sM} ${s.getDate()}, ${s.getFullYear()} to ${eM} ${e.getDate()}, ${e.getFullYear()}`;
}
