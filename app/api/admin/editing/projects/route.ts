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
 *   logo + editor email + a video_count rollup. The /admin/editing
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
  status: z
    .enum(['editing', 'need_approval', 'revising', 'approved', 'done', 'archived'])
    .optional(),
  clientId: z.string().uuid().optional(),
  include: z.enum(['archived']).optional(),
});

const CreateBody = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  project_type: z.enum(['editing', 'calendar']).default('editing'),
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
      `id, client_id, name, project_type, status, editor_id,
       videographer_id, strategist_id, project_brief, shoot_date,
       drive_folder_url, notes,
       drop_id, created_by, created_at, updated_at, ready_at, approved_at,
       scheduled_at, archived_at, promoted_at,
       client:clients!editing_projects_client_id_fkey(name, slug, logo_url),
       editor:team_members!editing_projects_editor_id_fkey(email, full_name),
       videographer:team_members!editing_projects_videographer_id_fkey(email, full_name),
       strategist:team_members!editing_projects_strategist_id_fkey(email, full_name),
       raw_videos:editing_project_raw_videos(count)`,
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

  // Roll up client-facing send timestamps so the unified review table can
  // show "Date sent" for editing projects. Truth source is the per-send
  // archive (`editing_share_link_emails.sent_at`); we fall back to the
  // share-link bookmark (`last_review_email_sent_at`) when the archive
  // insert was skipped (it's best-effort - see share/[linkId]/email).
  const projectIds = (data ?? []).map((r) => (r as { id: string }).id);
  const sendStats = new Map<
    string,
    {
      first_sent_at: string | null;
      last_sent_at: string | null;
      send_count: number;
      last_followup_at: string | null;
      followup_count: number;
    }
  >();
  if (projectIds.length) {
    const { data: linkRows } = await admin
      .from('editing_project_share_links')
      .select(
        'id, project_id, last_review_email_sent_at, last_followup_at, followup_count',
      )
      .in('project_id', projectIds);
    const links = (linkRows ?? []) as Array<{
      id: string;
      project_id: string;
      last_review_email_sent_at: string | null;
      last_followup_at: string | null;
      followup_count: number | null;
    }>;
    const linkToProject = new Map(links.map((l) => [l.id, l.project_id]));
    const linkIds = links.map((l) => l.id);
    const archiveRows = linkIds.length
      ? (
          await admin
            .from('editing_share_link_emails')
            .select('share_link_id, sent_at')
            .in('share_link_id', linkIds)
        ).data ?? []
      : [];
    for (const r of archiveRows as Array<{ share_link_id: string; sent_at: string }>) {
      const pid = linkToProject.get(r.share_link_id);
      if (!pid) continue;
      const cur = sendStats.get(pid) ?? {
        first_sent_at: null,
        last_sent_at: null,
        send_count: 0,
        last_followup_at: null,
        followup_count: 0,
      };
      cur.send_count += 1;
      if (!cur.first_sent_at || r.sent_at < cur.first_sent_at) cur.first_sent_at = r.sent_at;
      if (!cur.last_sent_at || r.sent_at > cur.last_sent_at) cur.last_sent_at = r.sent_at;
      sendStats.set(pid, cur);
    }
    // Fallback: for any link whose archive insert was lost, fold its
    // bookmark into the project's stats so the column doesn't go blank.
    for (const link of links) {
      const cur = sendStats.get(link.project_id) ?? {
        first_sent_at: null,
        last_sent_at: null,
        send_count: 0,
        last_followup_at: null,
        followup_count: 0,
      };
      if (link.last_review_email_sent_at) {
        const ts = link.last_review_email_sent_at;
        if (!cur.first_sent_at || ts < cur.first_sent_at) cur.first_sent_at = ts;
        if (!cur.last_sent_at || ts > cur.last_sent_at) cur.last_sent_at = ts;
      }
      // Followup rollup: max(last_followup_at), sum(followup_count) across links.
      // Initial deliverable sends never bump followup_count, so this only
      // reflects manual re-review sends + cron cadence stages.
      if (link.last_followup_at) {
        if (!cur.last_followup_at || link.last_followup_at > cur.last_followup_at) {
          cur.last_followup_at = link.last_followup_at;
        }
      }
      cur.followup_count += link.followup_count ?? 0;
      sendStats.set(link.project_id, cur);
    }
  }

  // Per-video review-state rollup. The project's `status` column only
  // advances on explicit admin action, so a fully-approved deliverable
  // can still read `editing` here. The unified review table needs the
  // real "creatives approved" count — mirror calendar's latestReview()
  // walk over editing_project_review_comments.
  const reviewCounts = new Map<
    string,
    { approved: number; changes: number; pending: number; total: number }
  >();
  // Deduped slot map per project (latest version per position), shared
  // between the reviewCounts walk and the `video_count` rollup so both
  // surfaces the same "5 deliverables" answer when a v1 has been
  // replaced by v2.
  const projectToVideos = new Map<string, string[]>();
  if (projectIds.length) {
    const [{ data: videoRows }, { data: commentRows }] = await Promise.all([
      admin
        .from('editing_project_videos')
        .select('id, project_id, position, version')
        .in('project_id', projectIds)
        // Order so the first row we see per (project, position) is the
        // latest revision. Mirrors the detail route's dedup.
        .order('position', { ascending: true })
        .order('version', { ascending: false }),
      admin
        .from('editing_project_review_comments')
        .select('video_id, status, metadata, created_at')
        .in('project_id', projectIds)
        .in('status', ['approved', 'changes_requested'])
        .order('created_at', { ascending: true }),
    ]);
    const videoToProject = new Map<string, string>();
    // Track which (project, position) slots we've already taken so older
    // revisions don't inflate the deliverable count. When a strategist
    // replaces v1 with v2, the row count goes to 2 but the deliverable
    // count should stay at 1 (the v2 cut is the only one awaiting review).
    const seenSlots = new Set<string>();
    for (const v of (videoRows ?? []) as Array<{
      id: string;
      project_id: string;
      position: number | null;
      version: number | null;
    }>) {
      const slotKey = `${v.project_id}:${v.position ?? 0}`;
      if (seenSlots.has(slotKey)) continue;
      seenSlots.add(slotKey);
      videoToProject.set(v.id, v.project_id);
      const arr = projectToVideos.get(v.project_id) ?? [];
      arr.push(v.id);
      projectToVideos.set(v.project_id, arr);
    }
    const byVideo = new Map<
      string,
      Array<{ status: string; metadata: Record<string, unknown> | null; created_at: string }>
    >();
    for (const c of (commentRows ?? []) as Array<{
      video_id: string;
      status: string;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>) {
      const arr = byVideo.get(c.video_id) ?? [];
      arr.push({ status: c.status, metadata: c.metadata, created_at: c.created_at });
      byVideo.set(c.video_id, arr);
    }
    function latestReview(
      rows: Array<{ status: string; metadata: Record<string, unknown> | null }>,
    ): 'approved' | 'changes_requested' | null {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.status === 'approved') return 'approved';
        if (r.status === 'changes_requested') {
          const resolved = !!(r.metadata && (r.metadata as Record<string, unknown>).resolved);
          if (!resolved) return 'changes_requested';
        }
      }
      return null;
    }
    for (const pid of projectIds) {
      const vids = projectToVideos.get(pid) ?? [];
      let approved = 0;
      let changes = 0;
      let pending = 0;
      for (const vid of vids) {
        const s = latestReview(byVideo.get(vid) ?? []);
        if (s === 'approved') approved += 1;
        else if (s === 'changes_requested') changes += 1;
        else pending += 1;
      }
      reviewCounts.set(pid, { approved, changes, pending, total: vids.length });
    }
  }

  // Deduped slot count per project, used as the canonical `video_count`
  // surfaced to the UI. The raw `editing_project_videos(count)` aggregate
  // would double-count replacement revisions (v1 + v2 = 2 rows for one
  // deliverable slot) — the unified review table and admin board both
  // want the slot count, not the row count.
  const dedupedVideoCount = new Map<string, number>();
  for (const [pid, vids] of projectToVideos.entries()) {
    dedupedVideoCount.set(pid, vids.length);
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
    editor_id: row.editor_id,
    editor_email: row.editor?.email ?? null,
    editor_name: row.editor?.full_name ?? null,
    videographer_id: row.videographer_id ?? null,
    videographer_email: row.videographer?.email ?? null,
    videographer_name: row.videographer?.full_name ?? null,
    strategist_id: row.strategist_id ?? null,
    strategist_email: row.strategist?.email ?? null,
    strategist_name: row.strategist?.full_name ?? null,
    project_brief: row.project_brief ?? null,
    shoot_date: row.shoot_date ?? null,
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
    promoted_at: row.promoted_at ?? null,
    // Deduped slot count, not the raw row count. See dedup walk above —
    // when a v1 cut gets replaced by v2, both rows live in the table but
    // the deliverable count should stay at 1.
    video_count: dedupedVideoCount.get(row.id) ?? 0,
    raw_video_count: Array.isArray(row.raw_videos) ? row.raw_videos[0]?.count ?? 0 : 0,
    first_sent_at: sendStats.get(row.id)?.first_sent_at ?? null,
    last_sent_at: sendStats.get(row.id)?.last_sent_at ?? null,
    send_count: sendStats.get(row.id)?.send_count ?? 0,
    last_followup_at: sendStats.get(row.id)?.last_followup_at ?? null,
    followup_count: sendStats.get(row.id)?.followup_count ?? 0,
    approved_count: reviewCounts.get(row.id)?.approved ?? 0,
    changes_count: reviewCounts.get(row.id)?.changes ?? 0,
    pending_count:
      reviewCounts.get(row.id)?.pending ?? (dedupedVideoCount.get(row.id) ?? 0),
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

  // Account-level assignment overrides creator-as-editor. Read the
  // client's per-account defaults (migration 240) in parallel with the
  // creator's team_members lookup so we can fall back when the brand
  // hasn't set one. Defaults always win when present.
  const [clientDefaultsRes, creatorRes] = await Promise.all([
    admin
      .from('clients')
      .select('default_strategist_id, default_editor_id')
      .eq('id', parsed.data.client_id)
      .maybeSingle(),
    admin
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const clientDefaults = clientDefaultsRes.data as
    | { default_strategist_id: string | null; default_editor_id: string | null }
    | null;
  const creatorTeamId = (creatorRes.data?.id as string | undefined) ?? null;
  const editorId = clientDefaults?.default_editor_id ?? creatorTeamId;
  const strategistId = clientDefaults?.default_strategist_id ?? null;

  const { data, error } = await admin
    .from('editing_projects')
    .insert({
      client_id: parsed.data.client_id,
      name: parsed.data.name,
      project_type: parsed.data.project_type,
      drive_folder_url: parsed.data.drive_folder_url ?? null,
      notes: parsed.data.notes ?? null,
      created_by: user.id,
      editor_id: editorId,
      strategist_id: strategistId,
    })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'create_failed', detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
