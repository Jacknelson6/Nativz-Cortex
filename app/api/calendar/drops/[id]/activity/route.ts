import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/calendar/drops/:id/activity
 *
 * Powers the "History" tab on the calendar share-link detail dialog.
 * Returns a single time-ordered feed combining:
 *
 *   - share_link_view  ← someone (possibly named via ?as=...) opened a /c/<token> page
 *   - email_sent       ← any drop-scoped email (review request, follow-up, etc.) sent / failed
 *   - share_link       ← a new share link was minted for this drop
 *
 * Newest first. Cap at 200 events. The dialog switches on `kind` to render.
 *
 * Mirrors the editing-projects activity route shape exactly so the History
 * panel component can be shared.
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

  const { data: drop } = await admin
    .from('content_drops')
    .select('id')
    .eq('id', id)
    .single();
  if (!drop) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Pull share links for this drop so we know which view rows belong here
  // and can attach a share URL fragment to each event.
  const { data: links } = await admin
    .from('content_drop_share_links')
    .select('id, token, created_at')
    .eq('drop_id', id);
  const linkIds = (links ?? []).map((l) => l.id as string);

  const [viewsRes, emailsRes] = await Promise.all([
    linkIds.length
      ? admin
          .from('content_drop_share_link_views')
          .select('share_link_id, viewed_at, viewer_name')
          .in('share_link_id', linkIds)
          .order('viewed_at', { ascending: false })
          .limit(200)
      : Promise.resolve({
          data: [] as Array<{
            share_link_id: string;
            viewed_at: string;
            viewer_name: string | null;
          }>,
        }),
    // email_messages.drop_id is a direct FK on this drop (see migration 194),
    // which is simpler than the editing path's metadata.projectId match.
    admin
      .from('email_messages')
      .select('recipient_email, subject, status, failure_reason, sent_at, created_at')
      .eq('drop_id', id)
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
        url: `/c/${link.token}`,
        // content_drop_share_links has no created_by column today;
        // surface null so the History panel still renders consistently.
        created_by: null,
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
        share_url: link ? `/c/${link.token}` : '',
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
  };
  for (const e of (emailsRes.data ?? []) as EmailRow[]) {
    events.push({
      kind: 'email_sent',
      at: e.sent_at ?? e.created_at ?? new Date().toISOString(),
      detail: {
        to: e.recipient_email ?? '',
        subject: e.subject,
        status: e.status,
        failure_reason: e.failure_reason,
      },
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return NextResponse.json({ activity: events.slice(0, 200) });
}
