import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/editing/projects/:id/share
 *   Mints a fresh share token. Returns the public review URL the editor
 *   pastes into the client email. No body — every call creates a new
 *   link (lets the editor revoke an old one by ignoring it; matches the
 *   social drops flow).
 *
 * GET  /api/admin/editing/projects/:id/share
 *   Lists past links for this project + view counts so the detail panel
 *   can show "shared 3 times, last opened yesterday."
 */

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const { data: project } = await admin
    .from('editing_projects')
    .select('id, clients(agency)')
    .eq('id', id)
    .single<{ id: string; clients: { agency: string | null } | null }>();
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { count } = await admin
    .from('editing_project_videos')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', id);
  if (!count || count === 0) {
    return NextResponse.json(
      { error: 'no_videos', detail: 'Upload at least one edited cut before sharing.' },
      { status: 400 },
    );
  }

  const { data: link, error } = await admin
    .from('editing_project_share_links')
    .insert({ project_id: id, created_by: user.id })
    .select('id, token, expires_at, created_at')
    .single();
  if (error || !link) {
    return NextResponse.json(
      { error: 'create_failed', detail: error?.message ?? 'Failed to mint link' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    link,
    url: `${resolveAppUrl(project.clients?.agency)}/c/edit/${link.token}`,
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const { data: project } = await admin
    .from('editing_projects')
    .select('id, clients(agency)')
    .eq('id', id)
    .single<{ id: string; clients: { agency: string | null } | null }>();
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: links } = await admin
    .from('editing_project_share_links')
    .select(
      'id, token, expires_at, created_at, last_viewed_at, archived_at, last_review_email_sent_at',
    )
    .eq('project_id', id)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const linkIds = (links ?? []).map((l) => l.id as string);
  type ViewRow = {
    share_link_id: string;
    viewed_at: string;
    viewer_name: string | null;
  };
  const { data: viewRows } = linkIds.length
    ? await admin
        .from('editing_project_share_link_views')
        .select('share_link_id, viewed_at, viewer_name')
        .in('share_link_id', linkIds)
        .order('viewed_at', { ascending: false })
        .limit(500)
        .returns<ViewRow[]>()
    : { data: [] as ViewRow[] };

  const viewsByLink: Record<string, ViewRow[]> = {};
  for (const v of viewRows ?? []) {
    (viewsByLink[v.share_link_id] ||= []).push(v);
  }

  // Pull every revision (version > 1) for the project once so we can compute
  // each link's "videos uploaded since the last review email" count without N
  // round-trips.
  type VideoRow = { id: string; version: number; created_at: string };
  const { data: revisionRows } = await admin
    .from('editing_project_videos')
    .select('id, version, created_at')
    .eq('project_id', id)
    .gt('version', 1)
    .returns<VideoRow[]>();

  const appUrl = resolveAppUrl(project.clients?.agency);
  const now = Date.now();
  const history = (links ?? []).map((row) => {
    const expires = new Date(row.expires_at as string).getTime();
    const isExpired = Number.isFinite(expires) && expires < now;
    const allViews = viewsByLink[row.id as string] ?? [];
    const lastSent = (row.last_review_email_sent_at as string | null) ?? null;
    const pending =
      lastSent && revisionRows
        ? revisionRows.filter((v) => v.created_at > lastSent).length
        : 0;
    const kind: 'delivery' | 'rereview' = lastSent ? 'rereview' : 'delivery';
    return {
      id: row.id,
      url: `${appUrl}/c/edit/${row.token}`,
      created_at: row.created_at,
      expires_at: row.expires_at,
      last_viewed_at: row.last_viewed_at,
      last_review_email_sent_at: lastSent,
      revoked: isExpired,
      view_count: allViews.length,
      pending_revision_count: pending,
      kind,
      views: allViews.slice(0, 50).map((v) => ({
        viewed_at: v.viewed_at,
        viewer_name: v.viewer_name,
      })),
    };
  });

  return NextResponse.json({ links: history });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const linkId = url.searchParams.get('linkId');
  if (!linkId) {
    return NextResponse.json({ error: 'bad_request', detail: 'linkId required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('editing_project_share_links')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', linkId)
    .eq('project_id', id);
  if (error) {
    return NextResponse.json({ error: 'revoke_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

function resolveAppUrl(agency: string | null | undefined): string {
  const brand = getBrandFromAgency(agency);
  return process.env.NODE_ENV !== 'production'
    ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
    : getCortexAppUrl(brand);
}
