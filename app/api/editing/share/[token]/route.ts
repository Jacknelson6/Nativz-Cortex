import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/editing/share/:token
 *
 * Public (no auth) fetch endpoint for the editing-project review page.
 * Resolves the token, joins the project + client + edited cuts, and
 * stamps a view row so the editor sees an "opened" indicator on their
 * side. We deliberately surface only the fields the public page renders
 * — no notes, no internal IDs beyond what playback needs, no internal
 * uploader identity.
 *
 * Mirrors the social-drops flow at /api/calendar/share/:token but is
 * far smaller because editing projects have no captions / schedule /
 * platforms / per-post review status. Just videos.
 */

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const viewerName = url.searchParams.get('as')?.trim() || null;

  const admin = createAdminClient();

  const { data: link } = await admin
    .from('editing_project_share_links')
    .select('id, project_id, expires_at, archived_at')
    .eq('token', token)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (link.archived_at) {
    return NextResponse.json({ error: 'revoked' }, { status: 410 });
  }
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  const { data: project } = await admin
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
    }>();

  if (!project) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Surface only the latest cut per `position` slot. Older revisions stay
  // in the table for editor history but the public review page should
  // show one polished tile per intended deliverable.
  const { data: rawVideos } = await admin
    .from('editing_project_videos')
    .select('id, filename, public_url, drive_file_id, mime_type, duration_s, thumbnail_url, version, position, created_at')
    .eq('project_id', link.project_id)
    .order('position', { ascending: true })
    .order('version', { ascending: false });

  const seenPositions = new Set<number>();
  const videos = (rawVideos ?? []).flatMap((v) => {
    const pos = (v.position as number | null) ?? 0;
    if (seenPositions.has(pos)) return [];
    seenPositions.add(pos);
    return [
      {
        id: v.id,
        filename: v.filename,
        public_url: v.public_url,
        drive_file_id: v.drive_file_id,
        mime_type: v.mime_type,
        duration_s: v.duration_s,
        thumbnail_url: v.thumbnail_url,
        version: v.version,
        position: pos,
        created_at: v.created_at,
      },
    ];
  });

  // Fire-and-forget view tracking. Failures here MUST NOT block the page
  // from rendering — the user-facing flow is "open the link, see the
  // videos." We log + insert in the background.
  void admin
    .from('editing_project_share_link_views')
    .insert({
      share_link_id: link.id,
      viewer_name: viewerName,
      ip: req.headers.get('x-forwarded-for') ?? null,
      user_agent: req.headers.get('user-agent') ?? null,
    })
    .then(() =>
      admin
        .from('editing_project_share_links')
        .update({ last_viewed_at: new Date().toISOString() })
        .eq('id', link.id),
    );

  return NextResponse.json({
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
    videos,
    expires_at: link.expires_at,
  });
}
