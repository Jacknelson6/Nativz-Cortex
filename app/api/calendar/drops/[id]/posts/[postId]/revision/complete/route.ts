import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { sendCalendarRevisionsCompleteEmail } from '@/lib/email/resend';
import { getNotificationSetting } from '@/lib/notifications/get-setting';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

/**
 * POST /api/calendar/drops/[id]/posts/[postId]/revision/complete
 *
 * Admin-only. Stamps `revisions_completed_at` on every `post_review_links`
 * row tied to this post (across all share links for the drop). When this
 * resolves the last open `changes_requested` in the drop, fires the
 * `calendar_revisions_complete` event email to portal users for the client.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; postId: string }> },
) {
  const { id: dropId, postId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Confirm the post belongs to this drop.
  const { data: video } = await admin
    .from('content_drop_videos')
    .select('id, drop_id, scheduled_post_id')
    .eq('drop_id', dropId)
    .eq('scheduled_post_id', postId)
    .single();
  if (!video) return NextResponse.json({ error: 'post not found in drop' }, { status: 404 });

  // Collect every review link id mapped to this post across the drop's share links.
  const { data: shareLinks } = await admin
    .from('content_drop_share_links')
    .select('id, token, included_post_ids, post_review_link_map, content_drops!inner(client_id, clients!inner(id, name, agency))')
    .eq('drop_id', dropId);

  const reviewLinkIds = new Set<string>();
  for (const link of shareLinks ?? []) {
    const map = (link.post_review_link_map ?? {}) as Record<string, string>;
    const reviewId = map[postId];
    if (reviewId) reviewLinkIds.add(reviewId);
  }

  if (reviewLinkIds.size === 0) {
    return NextResponse.json({ error: 'no review links for this post' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await admin
    .from('post_review_links')
    .update({ revisions_completed_at: nowIso, revisions_completed_by: user.id })
    .in('id', Array.from(reviewLinkIds));
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Are there still posts in this drop with open changes_requested?
  const allOutstanding = await getOutstandingPosts(admin, dropId);
  const dropFullyClean = allOutstanding.length === 0;

  let emailed = false;
  if (dropFullyClean) {
    emailed = await maybeSendRevisionsCompleteEmail({
      admin,
      dropId,
      shareLinks: shareLinks ?? [],
    });
  }

  return NextResponse.json({
    completed_at: nowIso,
    drop_clean: dropFullyClean,
    outstanding_posts: allOutstanding,
    emailed,
  });
}

async function getOutstandingPosts(
  admin: ReturnType<typeof createAdminClient>,
  dropId: string,
): Promise<string[]> {
  // Posts whose newest changes_requested comment is newer than their
  // revisions_completed_at marker (or whose marker is null).
  const { data: links } = await admin
    .from('content_drop_share_links')
    .select('post_review_link_map')
    .eq('drop_id', dropId);
  const reviewLinkIds: string[] = [];
  const reviewLinkToPost: Record<string, string> = {};
  for (const link of links ?? []) {
    for (const [postId, reviewId] of Object.entries(
      (link.post_review_link_map ?? {}) as Record<string, string>,
    )) {
      reviewLinkIds.push(reviewId);
      reviewLinkToPost[reviewId] = postId;
    }
  }
  if (reviewLinkIds.length === 0) return [];

  const { data: rows } = await admin
    .from('post_review_links')
    .select('id, revisions_completed_at')
    .in('id', reviewLinkIds);

  const completedAtById: Record<string, string | null> = {};
  for (const r of rows ?? []) {
    completedAtById[r.id] = r.revisions_completed_at ?? null;
  }

  const { data: latestChanges } = await admin
    .from('post_review_comments')
    .select('review_link_id, created_at')
    .eq('status', 'changes_requested')
    .in('review_link_id', reviewLinkIds)
    .order('created_at', { ascending: false });

  const newestByLink: Record<string, string> = {};
  for (const c of latestChanges ?? []) {
    if (!newestByLink[c.review_link_id]) newestByLink[c.review_link_id] = c.created_at;
  }

  const outstanding = new Set<string>();
  for (const [reviewId, lastChanges] of Object.entries(newestByLink)) {
    const completedAt = completedAtById[reviewId];
    if (!completedAt || new Date(lastChanges) > new Date(completedAt)) {
      outstanding.add(reviewLinkToPost[reviewId]);
    }
  }
  return Array.from(outstanding);
}

interface ShareLinkWithClient {
  id: string;
  token: string;
  content_drops: {
    client_id: string;
    clients: {
      id: string;
      name: string;
      agency: string | null;
    } | null;
  } | null;
}

async function maybeSendRevisionsCompleteEmail(opts: {
  admin: ReturnType<typeof createAdminClient>;
  dropId: string;
  shareLinks: unknown[];
}): Promise<boolean> {
  const setting = await getNotificationSetting('calendar_revisions_complete');
  if (!setting.enabled) return false;

  // Pull client info from the first share link (all share links belong to the same drop/client).
  const first = opts.shareLinks[0] as ShareLinkWithClient | undefined;
  const client = first?.content_drops?.clients;
  if (!client) return false;

  const brand = getBrandFromAgency(client.agency);
  const appUrl = process.env.NODE_ENV !== 'production'
    ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
    : getCortexAppUrl(brand);
  const newestLink = opts.shareLinks[0] as ShareLinkWithClient;
  const shareUrl = `${appUrl}/c/${newestLink.token}`;

  const { data: portalUsers } = await opts.admin
    .from('user_client_access')
    .select('users!inner(email, role)')
    .eq('client_id', client.id)
    .returns<{ users: { email: string; role: string } | null }[]>();
  const recipients = Array.from(
    new Set(
      (portalUsers ?? [])
        .map((r) => r.users?.email)
        .filter((e): e is string => !!e),
    ),
  );
  if (recipients.length === 0) return false;

  await Promise.all(
    recipients.map((to) =>
      sendCalendarRevisionsCompleteEmail({
        to,
        clientName: client.name,
        shareUrl,
        agency: brand,
      }),
    ),
  );
  return true;
}
