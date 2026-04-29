import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/calendar/review
 *
 * Returns the share-link inventory powering the new "Review" subpage. One
 * row per share link, with enough aggregates to render a status pill on
 * the bento card (counts of approved / changes-requested per included
 * post). Heavy lifting happens server-side so the client just renders.
 *
 * Scoping:
 *  - admins: optionally narrowed to ?clientId= (defaults to all visible
 *    brands). No org filter — admin already sees every brand they have
 *    access to via the active brand pill upstream.
 *  - viewers: scoped to clients in their `user_client_access` rows. Pure
 *    server-side filter, no trusting of the request body.
 */
export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const url = new URL(req.url);
  const clientIdFilter = url.searchParams.get('clientId')?.trim() || null;

  const userIsAdmin = await isAdmin(user.id);

  // Resolve the set of client_ids whose drops we're allowed to surface.
  let allowedClientIds: string[] | null = null; // null = no filter (admin, no clientId param)
  if (!userIsAdmin) {
    const { data: access } = await admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id);
    allowedClientIds = (access ?? []).map((r) => r.client_id);
    if (allowedClientIds.length === 0) {
      return NextResponse.json({ links: [], isAdmin: false });
    }
  } else if (clientIdFilter) {
    allowedClientIds = [clientIdFilter];
  }

  // Step 1: scope drops to allowed clients (if any filter applies).
  let dropsQuery = admin
    .from('content_drops')
    .select('id, client_id, start_date, end_date');
  if (allowedClientIds) {
    dropsQuery = dropsQuery.in('client_id', allowedClientIds);
  }
  const { data: drops } = await dropsQuery;
  if (!drops || drops.length === 0) {
    return NextResponse.json({ links: [], isAdmin: userIsAdmin });
  }

  const dropIds = drops.map((d) => d.id);
  const dropById = new Map(drops.map((d) => [d.id, d]));

  // Step 2: pull share links for those drops.
  const { data: links } = await admin
    .from('content_drop_share_links')
    .select(
      'id, drop_id, token, included_post_ids, post_review_link_map, expires_at, created_at, last_viewed_at, name, project_type, project_type_other, abandoned_at',
    )
    .in('drop_id', dropIds)
    .order('created_at', { ascending: false });

  if (!links || links.length === 0) {
    return NextResponse.json({ links: [], isAdmin: userIsAdmin });
  }

  // Step 3: client names (only need names for admin; viewer cards omit
  // the brand label since they're already brand-scoped via the top pill).
  const clientIds = Array.from(new Set(drops.map((d) => d.client_id)));
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug')
    .in('id', clientIds);
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));

  // Step 4: pull every comment that could affect status. Aggregating in JS
  // (rather than a Postgres view) keeps the implementation tight; we can
  // promote to a materialised view later if this gets slow.
  type LinkRow = (typeof links)[number] & {
    post_review_link_map: Record<string, string>;
  };
  const allReviewLinkIds = new Set<string>();
  for (const l of links as LinkRow[]) {
    for (const v of Object.values(l.post_review_link_map ?? {})) {
      if (typeof v === 'string') allReviewLinkIds.add(v);
    }
  }

  type CommentRow = {
    review_link_id: string;
    status: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  };
  const commentsByReviewLink = new Map<string, CommentRow[]>();
  if (allReviewLinkIds.size > 0) {
    const { data: comments } = await admin
      .from('post_review_comments')
      .select('review_link_id, status, metadata, created_at')
      .in('review_link_id', Array.from(allReviewLinkIds))
      .order('created_at', { ascending: true });
    for (const c of (comments ?? []) as CommentRow[]) {
      const arr = commentsByReviewLink.get(c.review_link_id) ?? [];
      arr.push(c);
      commentsByReviewLink.set(c.review_link_id, arr);
    }
  }

  // Step 5: aggregate per-link status.
  // Per-post status walks comments newest→oldest, skipping resolved
  // changes_requested rows (mirrors `latestReview()` in /c/[token]).
  function postStatus(comments: CommentRow[]): 'approved' | 'changes_requested' | null {
    for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      if (c.status === 'approved') return 'approved';
      if (c.status === 'changes_requested') {
        const resolved = !!(c.metadata && (c.metadata as Record<string, unknown>).resolved);
        if (!resolved) return 'changes_requested';
      }
    }
    return null;
  }

  const now = Date.now();
  const out = (links as LinkRow[]).map((link) => {
    const drop = dropById.get(link.drop_id);
    const client = drop ? clientById.get(drop.client_id) : null;

    let approvedCount = 0;
    let changesCount = 0;
    let pendingCount = 0;
    for (const postId of link.included_post_ids ?? []) {
      const reviewLinkId = (link.post_review_link_map ?? {})[postId];
      const comments = reviewLinkId
        ? commentsByReviewLink.get(reviewLinkId) ?? []
        : [];
      const s = postStatus(comments);
      if (s === 'approved') approvedCount += 1;
      else if (s === 'changes_requested') changesCount += 1;
      else pendingCount += 1;
    }

    const expired = new Date(link.expires_at).getTime() < now;
    const abandoned = !!(link as { abandoned_at?: string | null }).abandoned_at;
    let status: 'abandoned' | 'expired' | 'approved' | 'revising' | 'ready_for_review';
    if (abandoned) status = 'abandoned';
    else if (expired) status = 'expired';
    else if (changesCount > 0) status = 'revising';
    else if ((link.included_post_ids ?? []).length > 0 && approvedCount === (link.included_post_ids ?? []).length)
      status = 'approved';
    else status = 'ready_for_review';

    const linkExtra = link as {
      name?: string | null;
      project_type?: string | null;
      project_type_other?: string | null;
      abandoned_at?: string | null;
    };

    return {
      id: link.id,
      token: link.token,
      drop_id: link.drop_id,
      drop_start: drop?.start_date ?? null,
      drop_end: drop?.end_date ?? null,
      client_id: drop?.client_id ?? null,
      client_name: client?.name ?? null,
      post_count: link.included_post_ids?.length ?? 0,
      approved_count: approvedCount,
      changes_count: changesCount,
      pending_count: pendingCount,
      status,
      expires_at: link.expires_at,
      created_at: link.created_at,
      last_viewed_at: link.last_viewed_at,
      name: linkExtra.name ?? null,
      project_type: linkExtra.project_type ?? null,
      project_type_other: linkExtra.project_type_other ?? null,
      abandoned_at: linkExtra.abandoned_at ?? null,
    };
  });

  return NextResponse.json({ links: out, isAdmin: userIsAdmin });
}
