import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

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
  // Pull strategist/editor/notes alongside the date span so the unified
  // review modal can render the Team + Notes sections without a second
  // round trip. Strategist/editor are FKs into `team_members` (added in
  // migration 240); `notes` ships in migration 252 to mirror the
  // editing-project field.
  let dropsQuery = admin
    .from('content_drops')
    .select('id, client_id, start_date, end_date, strategist_id, editor_id, notes, pipeline_status');
  if (allowedClientIds) {
    dropsQuery = dropsQuery.in('client_id', allowedClientIds);
  }
  const { data: drops } = await dropsQuery;
  if (!drops || drops.length === 0) {
    return NextResponse.json({ links: [], isAdmin: userIsAdmin });
  }

  const dropIds = drops.map((d) => d.id);
  const dropById = new Map(drops.map((d) => [d.id, d]));

  // Step 2: pull share links for those drops. Archived rows are
  // soft-deleted via `archived_at` and must stay out of this list, the
  // share token still resolves directly so the column does the hiding.
  const { data: links } = await admin
    .from('content_drop_share_links')
    .select(
      'id, drop_id, token, included_post_ids, post_review_link_map, expires_at, created_at, last_viewed_at, name, project_type, project_type_other, abandoned_at, last_followup_at, followup_count, first_sent_at, last_sent_at, send_count, all_approved_notified_at',
    )
    .in('drop_id', dropIds)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (!links || links.length === 0) {
    return NextResponse.json({ links: [], isAdmin: userIsAdmin });
  }

  // Step 3: client names (only need names for admin; viewer cards omit
  // the brand label since they're already brand-scoped via the top pill).
  const clientIds = Array.from(new Set(drops.map((d) => d.client_id)));
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug, logo_url, agency')
    .in('id', clientIds);
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));

  // Step 3b: resolve strategist/editor display names off team_members so
  // the modal's Team picker has labels without a second round trip. The
  // picker itself fetches the full roster on open, but the unified
  // table needs the email/name to render the chip while the dropdown is
  // closed.
  const teamMemberIds = new Set<string>();
  for (const d of drops) {
    if (d.strategist_id) teamMemberIds.add(d.strategist_id as string);
    if (d.editor_id) teamMemberIds.add(d.editor_id as string);
  }
  const teamMemberById = new Map<string, { email: string | null; full_name: string | null }>();
  if (teamMemberIds.size > 0) {
    const { data: teamRows } = await admin
      .from('team_members')
      .select('id, email, full_name')
      .in('id', Array.from(teamMemberIds));
    for (const t of teamRows ?? []) {
      teamMemberById.set(t.id, { email: t.email, full_name: t.full_name });
    }
  }

  // Step 3c: live view counts per share link. The views table is small
  // (one row per visit) so a single COUNT(*) GROUP BY share_link_id keeps
  // us drift-free without a denormalised counter column. We aggregate in
  // JS because supabase-js doesn't expose grouping cleanly.
  const linkIdsForViews = (links ?? []).map((l) => l.id);
  const viewCountByLink = new Map<string, number>();
  if (linkIdsForViews.length > 0) {
    const { data: viewRows } = await admin
      .from('content_drop_share_link_views')
      .select('share_link_id')
      .in('share_link_id', linkIdsForViews);
    for (const r of viewRows ?? []) {
      viewCountByLink.set(
        r.share_link_id,
        (viewCountByLink.get(r.share_link_id) ?? 0) + 1,
      );
    }
  }

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
  // Per-post status mirrors latestReview() in /c/[token]: newest comment
  // that is not an activity event determines the state.
  const ACTIVITY = new Set(['caption_edit', 'tag_edit', 'cover_edit', 'schedule_change', 'video_revised']);
  function postStatus(comments: CommentRow[]): 'approved' | 'revising' | null {
    let lastApprovalIdx = -1;
    for (let i = comments.length - 1; i >= 0; i--) {
      if (comments[i].status === 'approved') { lastApprovalIdx = i; break; }
    }
    for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      if (ACTIVITY.has(c.status)) continue;
      if (c.status === 'approved') return 'approved';
      if (c.status === 'comment' && i > lastApprovalIdx) return 'revising';
    }
    return null;
  }

  // Step 5b: pull media_type for every included post so the accounting CSV
  // can split approved deliverables into "video" vs "static" buckets (Jack
  // bills $50/video, $15/static). `content_drop_videos` is misnamed: it
  // holds both video and image posts, with `media_type` ('video'|'image')
  // as the discriminator. We only need the IDs that are actually referenced
  // by an unarchived share link, so the query stays cheap even on big
  // accounts.
  const includedPostIds = new Set<string>();
  for (const l of links as LinkRow[]) {
    for (const id of l.included_post_ids ?? []) {
      if (typeof id === 'string') includedPostIds.add(id);
    }
  }
  const mediaTypeByPostId = new Map<string, 'video' | 'image'>();
  if (includedPostIds.size > 0) {
    const { data: postMedia } = await admin
      .from('content_drop_videos')
      .select('id, media_type')
      .in('id', Array.from(includedPostIds));
    for (const row of (postMedia ?? []) as { id: string; media_type: string | null }[]) {
      if (row.media_type === 'image' || row.media_type === 'video') {
        mediaTypeByPostId.set(row.id, row.media_type);
      }
    }
  }

  const now = Date.now();
  const out = (links as LinkRow[]).map((link) => {
    const drop = dropById.get(link.drop_id);
    const client = drop ? clientById.get(drop.client_id) : null;

    let approvedCount = 0;
    let approvedVideoCount = 0;
    let approvedImageCount = 0;
    let changesCount = 0;
    let pendingCount = 0;
    for (const postId of link.included_post_ids ?? []) {
      const reviewLinkId = (link.post_review_link_map ?? {})[postId];
      const comments = reviewLinkId
        ? commentsByReviewLink.get(reviewLinkId) ?? []
        : [];
      const s = postStatus(comments);
      if (s === 'approved') {
        approvedCount += 1;
        // Default unknown media_type to 'video' so legacy rows still bill;
        // pre-migration drops were video-only.
        const mt = mediaTypeByPostId.get(postId) ?? 'video';
        if (mt === 'image') approvedImageCount += 1;
        else approvedVideoCount += 1;
      } else if (s === 'revising') changesCount += 1;
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

    const dropPipelineStatus = (drop as { pipeline_status?: string | null } | undefined)
      ?.pipeline_status ?? null;

    const linkExtra = link as {
      name?: string | null;
      project_type?: string | null;
      project_type_other?: string | null;
      abandoned_at?: string | null;
      last_followup_at?: string | null;
      followup_count?: number | null;
      first_sent_at?: string | null;
      last_sent_at?: string | null;
      send_count?: number | null;
      all_approved_notified_at?: string | null;
    };

    // Calendar approved_at = the moment this share link tipped to 100%
    // approved. Sourced from the atomic-claim stamp written by
    // /approve-all and the per-post /comment route. Only meaningful when
    // `status === 'approved'`; we null it otherwise so the half-month
    // bucket logic on the client doesn't try to date a still-pending row.
    const approvedAt =
      status === 'approved' ? linkExtra.all_approved_notified_at ?? null : null;

    const brand = getBrandFromAgency(
      (client as { agency?: string | null } | undefined)?.agency ?? null,
    );
    const shareUrl = `${getCortexAppUrl(brand)}/s/${link.token}`;

    const dropExtra = drop as
      | {
          strategist_id?: string | null;
          editor_id?: string | null;
          notes?: string | null;
        }
      | undefined;
    const strategist = dropExtra?.strategist_id
      ? teamMemberById.get(dropExtra.strategist_id) ?? null
      : null;
    const editor = dropExtra?.editor_id
      ? teamMemberById.get(dropExtra.editor_id) ?? null
      : null;

    return {
      id: link.id,
      token: link.token,
      share_url: shareUrl,
      drop_id: link.drop_id,
      drop_start: drop?.start_date ?? null,
      drop_end: drop?.end_date ?? null,
      client_id: drop?.client_id ?? null,
      client_name: client?.name ?? null,
      client_agency: client?.agency ?? null,
      client_logo_url: client?.logo_url ?? null,
      post_count: link.included_post_ids?.length ?? 0,
      approved_count: approvedCount,
      approved_video_count: approvedVideoCount,
      approved_image_count: approvedImageCount,
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
      last_followup_at: linkExtra.last_followup_at ?? null,
      followup_count: linkExtra.followup_count ?? 0,
      first_sent_at: linkExtra.first_sent_at ?? null,
      last_sent_at: linkExtra.last_sent_at ?? null,
      send_count: linkExtra.send_count ?? 0,
      approved_at: approvedAt,
      view_count: viewCountByLink.get(link.id) ?? 0,
      notes: dropExtra?.notes ?? null,
      strategist_id: dropExtra?.strategist_id ?? null,
      strategist_email: strategist?.email ?? null,
      strategist_name: strategist?.full_name ?? null,
      editor_id: dropExtra?.editor_id ?? null,
      editor_email: editor?.email ?? null,
      editor_name: editor?.full_name ?? null,
      pipeline_status: dropPipelineStatus,
    };
  });

  return NextResponse.json({ links: out, isAdmin: userIsAdmin });
}
