import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import { reconcileMuxRow, type ReconcileTarget } from '@/lib/mux/reconcile';

export const dynamic = 'force-dynamic';

const EDITING_VIDEO_BINDING = { table: 'editing_project_videos' } as const;

/**
 * GET /api/editing/share/:token
 *
 * Public (no auth) fetch endpoint for the editing-project review page.
 * Resolves the token, joins the project + client + edited cuts, pulls
 * the per-video review thread, and stamps a view row so the editor
 * sees an "opened" indicator on their side.
 *
 * Mirrors the social-drops flow at /api/calendar/share/:token but is
 * smaller because editing projects have no captions / schedule /
 * platforms / tagged people / collaborators. Just videos + comments.
 *
 * The `isEditor` flag is true when the request is made by a signed-in
 * admin; the public page uses it to expose the replace / delete
 * affordances on each video row.
 */

interface CommentAttachment {
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

type CommentStatus =
  | 'approved'
  | 'comment'
  | 'video_revised';

interface CommentRow {
  id: string;
  video_id: string | null;
  share_link_id: string | null;
  author_name: string;
  author_user_id: string | null;
  author_role: 'admin' | 'viewer' | 'guest' | null;
  content: string;
  status: CommentStatus;
  kind: string | null;
  parent_comment_id: string | null;
  attachments: CommentAttachment[] | null;
  metadata: Record<string, unknown> | null;
  timestamp_seconds: number | null;
  created_at: string;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const viewerName = url.searchParams.get('as')?.trim().slice(0, 80) || null;

  const admin = createAdminClient();

  // Detect whether the viewer is a signed-in admin so the UI can expose
  // editor-only affordances (replace clip + delete clip).
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isEditor = user ? await isAdmin(user.id) : false;

  const { data: link } = await admin
    .from('editing_project_share_links')
    .select('id, project_id, name, expires_at, archived_at')
    .eq('token', token)
    .maybeSingle<{
      id: string;
      project_id: string;
      name: string | null;
      expires_at: string;
      archived_at: string | null;
    }>();

  if (!link) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (link.archived_at) {
    return NextResponse.json({ error: 'revoked' }, { status: 410 });
  }
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  const [{ data: project }, { data: rawVideos }, { data: comments }] =
    await Promise.all([
      admin
        .from('editing_projects')
        .select(
          `id, name, project_brief, project_type, status, shoot_date,
           client:clients!editing_projects_client_id_fkey(name, slug, logo_url, agency)`,
        )
        .eq('id', link.project_id)
        .maybeSingle<{
          id: string;
          name: string;
          project_brief: string | null;
          project_type: string;
          status: string;
          shoot_date: string | null;
          client: {
            name: string | null;
            slug: string | null;
            logo_url: string | null;
            agency: string | null;
          } | null;
        }>(),
      admin
        .from('editing_project_videos')
        .select(
          'id, filename, title, public_url, drive_file_id, mime_type, duration_s, thumbnail_url, version, position, created_at, mux_upload_id, mux_asset_id, mux_playback_id, mux_status',
        )
        .eq('project_id', link.project_id)
        // PRD 06: hide soft-deleted rows from the share-link surface.
        .is('archived_at', null)
        .order('position', { ascending: true })
        .order('version', { ascending: false }),
      admin
        .from('editing_project_review_comments')
        .select(
          'id, video_id, share_link_id, author_name, author_user_id, author_role, content, status, kind, parent_comment_id, attachments, metadata, timestamp_seconds, created_at',
        )
        .eq('project_id', link.project_id)
        .order('created_at', { ascending: true }),
    ]);

  if (!project) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Pull-mode self-heal: reconcile any Mux-backed rows that are still
  // mid-pipeline against the Mux API before building the response. Same
  // rationale as the SMM share endpoint - keeps webhook delivery a speed
  // optimisation, not a correctness dependency. Editing rows derive their
  // playback URL from `mux_playback_id` at render time, so we pass a
  // urlFields-less binding and skip the SMM-only revised_* writes.
  type EditingVideoRow = {
    id: string;
    filename: string | null;
    title: string | null;
    public_url: string | null;
    drive_file_id: string | null;
    mime_type: string | null;
    duration_s: number | null;
    thumbnail_url: string | null;
    version: number;
    position: number | null;
    created_at: string;
    mux_upload_id: string | null;
    mux_asset_id: string | null;
    mux_playback_id: string | null;
    mux_status: string | null;
  };
  const videoRows = (rawVideos ?? []) as EditingVideoRow[];
  const inFlight = videoRows.filter(
    (v) =>
      (v.mux_status === 'processing' || v.mux_status === 'uploading') &&
      v.mux_upload_id != null,
  );
  if (inFlight.length > 0) {
    try {
      const patches = await Promise.all(
        inFlight.map((row) =>
          reconcileMuxRow(admin, row as ReconcileTarget, EDITING_VIDEO_BINDING),
        ),
      );
      inFlight.forEach((row, i) => {
        const patch = patches[i];
        if (!patch) return;
        if (patch.mux_status !== undefined) row.mux_status = patch.mux_status;
        if (patch.mux_asset_id !== undefined) row.mux_asset_id = patch.mux_asset_id;
        if (patch.mux_playback_id !== undefined) row.mux_playback_id = patch.mux_playback_id;
      });
    } catch (err) {
      console.warn('[editing-share-get] mux reconcile batch failed; skipping', {
        count: inFlight.length,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Surface only the latest cut per `position` slot. Older revisions stay
  // in the table for editor history but the public review page should
  // show one polished tile per intended deliverable.
  const seenPositions = new Set<number>();
  const videos = videoRows.flatMap((v) => {
    const pos = v.position ?? 0;
    if (seenPositions.has(pos)) return [];
    seenPositions.add(pos);
    return [
      {
        id: v.id,
        filename: v.filename,
        title: v.title,
        public_url: v.public_url,
        drive_file_id: v.drive_file_id,
        mime_type: v.mime_type,
        duration_s: v.duration_s,
        thumbnail_url: v.thumbnail_url,
        version: v.version,
        position: pos,
        created_at: v.created_at,
        mux_playback_id: v.mux_playback_id,
        mux_status: v.mux_status,
      },
    ];
  });

  // Group comments by video_id for the public page; project-level (null
  // video_id) comments live in their own bucket so the page can render
  // an "Activity" rail above the video list.
  const commentsByVideo: Record<string, CommentRow[]> = {};
  const projectComments: CommentRow[] = [];
  for (const c of (comments ?? []) as CommentRow[]) {
    const row: CommentRow = {
      ...c,
      attachments: Array.isArray(c.attachments) ? c.attachments : [],
      metadata:
        c.metadata && typeof c.metadata === 'object' ? c.metadata : {},
    };
    if (row.video_id) {
      (commentsByVideo[row.video_id] ||= []).push(row);
    } else {
      projectComments.push(row);
    }
  }

  // Fire-and-forget view tracking. Failures here MUST NOT block the page
  // from rendering; we log + insert in the background.
  void admin
    .from('editing_project_share_link_views')
    .insert({
      share_link_id: link.id,
      viewer_name: viewerName,
      ip: req.headers.get('x-forwarded-for') ?? null,
      user_agent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
    })
    .then(() =>
      admin
        .from('editing_project_share_links')
        .update({ last_viewed_at: new Date().toISOString() })
        .eq('id', link.id),
    );

  return NextResponse.json({
    isEditor,
    share_link: {
      id: link.id,
      name: link.name,
    },
    project: {
      id: project.id,
      name: project.name,
      brief: project.project_brief,
      shoot_date: project.shoot_date,
      project_type: project.project_type,
    },
    client: {
      name: project.client?.name ?? null,
      slug: project.client?.slug ?? null,
      logo_url: project.client?.logo_url ?? null,
      agency: project.client?.agency ?? null,
    },
    videos: videos.map((v) => ({
      ...v,
      comments: commentsByVideo[v.id] ?? [],
    })),
    project_comments: projectComments,
    expires_at: link.expires_at,
  });
}
