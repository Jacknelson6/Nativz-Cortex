import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/editing/projects/:id/activity
 *
 * Powers the "History" tab on the editing project detail dialog.
 * Returns a single time-ordered feed combining:
 *
 *   - share_link_view   ← someone opened a /c/edit/<token> page
 *   - email_sent        ← editing_deliverable / editing_rereview email send
 *   - share_link        ← a new share link was minted
 *   - revision_uploaded ← a new revision (version > 1) was uploaded
 *
 * Newest first. Cap at 200 events so the panel stays snappy. The dialog
 * decides how to render each event type by switching on `kind`.
 */

type Activity =
  | {
      kind: 'share_link';
      at: string;
      detail: { url: string; created_by: string | null };
    }
  | {
      kind: 'share_link_view';
      at: string;
      detail: { viewer_name: string | null; share_url: string };
    }
  | {
      kind: 'email_sent';
      at: string;
      detail: {
        to: string;
        subject: string | null;
        status: string | null;
        failure_reason: string | null;
        /** `editing_deliverable` or `editing_rereview` so the panel can label it. */
        type_key: string | null;
      };
    }
  | {
      kind: 'revision_uploaded';
      at: string;
      detail: {
        version: number;
        title: string | null;
        position: number;
      };
    };

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
    .select('id')
    .eq('id', id)
    .single();
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Pull share links for this project so we know which view rows belong
  // here and can attach a share URL fragment to each event.
  const { data: links } = await admin
    .from('editing_project_share_links')
    .select('id, token, created_at, created_by')
    .eq('project_id', id);
  const linkIds = (links ?? []).map((l) => l.id as string);

  // Fan out the four queries in parallel — all read-only.
  const [viewsRes, emailsRes, revisionsRes] = await Promise.all([
    linkIds.length
      ? admin
          .from('editing_project_share_link_views')
          .select('share_link_id, viewed_at, viewer_name')
          .in('share_link_id', linkIds)
          .order('viewed_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as Array<{ share_link_id: string; viewed_at: string; viewer_name: string | null }> }),
    // email_messages doesn't have a direct project FK; the editing
    // deliverable + rereview senders both stamp `projectId` in metadata so
    // we filter on type_key membership and a metadata equality below.
    admin
      .from('email_messages')
      .select('id, recipient_email, subject, status, failure_reason, sent_at, created_at, metadata, type_key')
      .in('type_key', ['editing_deliverable', 'editing_rereview'])
      .order('created_at', { ascending: false })
      .limit(200),
    // Revisions = videos with version > 1. Each upload bumps version (see
    // editing/projects/[id]/videos POST `replace_video_id`) and reuses the
    // position, so we can show "v3 of cut #1 uploaded" without a separate
    // events table.
    admin
      .from('editing_project_videos')
      .select('id, version, position, title, created_at')
      .eq('project_id', id)
      .gt('version', 1)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const linkById = new Map(
    (links ?? []).map((l) => [l.id as string, l] as const),
  );

  const events: Activity[] = [];

  for (const link of links ?? []) {
    events.push({
      kind: 'share_link',
      at: link.created_at as string,
      detail: {
        url: `/c/edit/${link.token}`,
        created_by: (link.created_by as string | null) ?? null,
      },
    });
  }

  for (const v of viewsRes.data ?? []) {
    const link = linkById.get(v.share_link_id);
    events.push({
      kind: 'share_link_view',
      at: v.viewed_at,
      detail: {
        viewer_name: v.viewer_name,
        share_url: link ? `/c/edit/${link.token}` : '',
      },
    });
  }

  type EmailRow = {
    recipient_email: string | null;
    subject: string | null;
    status: string | null;
    failure_reason: string | null;
    sent_at: string | null;
    created_at: string | null;
    metadata: Record<string, unknown> | null;
    type_key: string | null;
  };
  for (const e of (emailsRes.data ?? []) as EmailRow[]) {
    const meta = e.metadata ?? {};
    if ((meta as { projectId?: string }).projectId !== id) continue;
    events.push({
      kind: 'email_sent',
      at: e.sent_at ?? e.created_at ?? new Date().toISOString(),
      detail: {
        to: e.recipient_email ?? '',
        subject: e.subject,
        status: e.status,
        failure_reason: e.failure_reason,
        type_key: e.type_key,
      },
    });
  }

  type RevisionRow = {
    version: number;
    position: number;
    title: string | null;
    created_at: string;
  };
  for (const r of (revisionsRes.data ?? []) as RevisionRow[]) {
    events.push({
      kind: 'revision_uploaded',
      at: r.created_at,
      detail: {
        version: r.version,
        title: r.title,
        position: r.position,
      },
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return NextResponse.json({ activity: events.slice(0, 200) });
}
