import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { mintOrRefreshShareLink } from '@/lib/calendar/share-link';
import { z } from 'zod';

const CreateShareLinkSchema = z.object({
  client_id: z.string().uuid(),
  post_ids: z.array(z.string().uuid()).min(1, 'Select at least one post'),
  // Kept for back-compat with the SharePostsDialog payload but unused — the
  // new flow doesn't store a label on the share link itself; the rich
  // viewer derives the heading from client + drop metadata.
  label: z.string().optional(),
});

/**
 * POST /api/scheduler/share
 *
 * Mint (or refresh) a rich `/c/{token}` share link for the calendar's
 * Share button. Replaces the OLD `client_review_links` flow so admins
 * always hand clients the modern viewer with caption editing, comments,
 * video revisions, named reviewers, etc.
 *
 * Wire-up: the new viewer at /c/{token} reads from `content_drops` +
 * `content_drop_videos`. To support free-form post selection from the
 * calendar (posts that may not be tied to a Drive ingest), this route
 * mints a *synthetic* `content_drops` row per client (one forever, found
 * on subsequent calls) marked `source='calendar_share'` (migration 259),
 * then mirrors each selected scheduled post as a `content_drop_videos`
 * child row with the publish-ready media URL copied over from
 * `scheduler_media`. Image/carousel posts also get matching
 * `content_drop_post_assets` rows.
 *
 * Refresh semantics match the Drive-drop share endpoint:
 *   - One active share link per client (partial unique index from
 *     migration 208). Re-sharing the same client refreshes the same row;
 *     the token stays stable so old URLs keep working.
 *   - Orphan posts dropped during a refresh are withdrawn from Zernio
 *     when previously approved + queued (see SafeStop incident).
 *   - A fresh `post_review_links` row is minted per post per share call
 *     to give the new cycle its own comment thread.
 *
 * @auth Required (any authenticated user)
 * @body client_id - Client UUID (required)
 * @body post_ids - Scheduled post UUIDs to share (min 1 required)
 * @returns {{ url: string, refreshed: boolean, cancelled_orphans: string[], unpublishable_orphans: string[] }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateShareLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { client_id: clientId, post_ids: postIds } = parsed.data;
    const admin = createAdminClient();

    const { data: clientRow } = await admin
      .from('clients')
      .select('agency')
      .eq('id', clientId)
      .maybeSingle<{ agency: string | null }>();

    // Step 1: find-or-create the per-client synthetic content_drops row.
    // Keying on (client_id, source='calendar_share') gives us exactly one
    // row per client forever; the partial unique index already enforces
    // one share link per client, so the synthetic drop maps 1:1 to that
    // share link's lifetime.
    const dropId = await getOrCreateCalendarShareDrop(admin, {
      clientId,
      createdBy: user.id,
    });

    // Step 2: rebuild the synthetic drop's content_drop_videos to mirror
    // exactly the selected posts. Easier than diffing — comments live on
    // post_review_links (not drop_videos), so wiping + re-inserting here
    // is non-destructive to review history.
    await admin
      .from('content_drop_videos')
      .delete()
      .eq('drop_id', dropId);

    await mirrorPostsAsDropVideos(admin, { dropId, postIds });

    // Step 3: mint a fresh post_review_links row per post so the new
    // share cycle gets its own comment thread (matches drop-share
    // pattern). Map post_id → review_link.id for mintOrRefreshShareLink.
    const linkRows = postIds.map((postId) => ({ post_id: postId }));
    const { data: reviewLinks, error: linkErr } = await admin
      .from('post_review_links')
      .insert(linkRows)
      .select('id, post_id');
    if (linkErr || !reviewLinks) {
      return NextResponse.json(
        { error: linkErr?.message ?? 'Failed to mint review links' },
        { status: 500 },
      );
    }
    const reviewMap: Record<string, string> = {};
    for (const rl of reviewLinks) {
      reviewMap[rl.post_id as string] = rl.id as string;
    }

    // Step 4: mint or refresh the share link itself. The helper handles
    // the partial-unique-index dance + Zernio orphan cleanup.
    let link;
    try {
      link = await mintOrRefreshShareLink(admin, {
        dropId,
        clientId,
        postIds,
        reviewMap,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to create share link' },
        { status: 500 },
      );
    }

    const appUrl =
      process.env.NODE_ENV !== 'production'
        ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
        : getCortexAppUrl(getBrandFromAgency(clientRow?.agency ?? null));

    return NextResponse.json({
      url: `${appUrl}/s/${link.token}`,
      link: { id: link.id, token: link.token, expires_at: link.expires_at },
      refreshed: link.refreshed,
      cancelled_orphans: link.cancelledOrphans,
      unpublishable_orphans: link.unpublishableOrphans,
    });
  } catch (error) {
    console.error('POST /api/scheduler/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Find-or-create the synthetic `content_drops` row that backs every
 * calendar Share for this client. Identified by (client_id,
 * source='calendar_share'); migration 259 added the source column. We
 * need exactly one row per client because the partial unique index on
 * `content_drop_share_links.client_id WHERE archived_at IS NULL` allows
 * only one active share link per client, and that share link points at
 * one drop.
 *
 * Drive-folder columns (drive_folder_url, drive_folder_id, start_date,
 * end_date) are nullable on synthetic drops — migration 259 dropped
 * those NOT NULLs.
 */
async function getOrCreateCalendarShareDrop(
  admin: SupabaseClient,
  opts: { clientId: string; createdBy: string },
): Promise<string> {
  const { data: existing } = await admin
    .from('content_drops')
    .select('id')
    .eq('client_id', opts.clientId)
    .eq('source', 'calendar_share')
    .maybeSingle<{ id: string }>();
  if (existing) return existing.id;

  const { data: created, error } = await admin
    .from('content_drops')
    .insert({
      client_id: opts.clientId,
      created_by: opts.createdBy,
      source: 'calendar_share',
      status: 'ready',
      // Drive-only columns intentionally omitted (now nullable).
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !created) {
    throw new Error(error?.message ?? 'Failed to create calendar share drop');
  }
  return created.id;
}

/**
 * Mirror each selected scheduled post as a `content_drop_videos` row on
 * the synthetic drop, copying the publish-ready media URL from
 * `scheduler_media`. For image/carousel posts we also seed
 * `content_drop_post_assets` rows so the viewer's carousel renders.
 *
 * URL strategy:
 *   - Prefer `late_media_url` (Late CDN, present once a draft is queued
 *     for publish). Synced calendar posts uploaded via the in-app
 *     library always have it.
 *   - Fall back to a Supabase storage public URL built from
 *     `storage_path` for posts that haven't reached the Late upload yet.
 *
 * Posts with no attached media (rare but possible — e.g. a draft with
 * just a caption) get a content_drop_videos row with null URLs; the
 * viewer renders an empty video frame in that case, which is acceptable
 * for review.
 */
async function mirrorPostsAsDropVideos(
  admin: SupabaseClient,
  opts: { dropId: string; postIds: string[] },
): Promise<void> {
  const { data: posts } = await admin
    .from('scheduled_posts')
    .select('id, post_type')
    .in('id', opts.postIds);

  type PostRow = { id: string; post_type: string | null };
  const postRows = (posts ?? []) as PostRow[];
  const postTypeById = new Map(postRows.map((p) => [p.id, p.post_type]));

  // Pull media for all posts in one query, grouped by post_id.
  const { data: mediaLinks } = await admin
    .from('scheduled_post_media')
    .select(
      'post_id, sort_order, scheduler_media:media_id (id, filename, late_media_url, storage_path, thumbnail_url, mime_type, width, height)',
    )
    .in('post_id', opts.postIds)
    .order('sort_order', { ascending: true });

  type MediaRow = {
    id: string;
    filename: string | null;
    late_media_url: string | null;
    storage_path: string | null;
    thumbnail_url: string | null;
    mime_type: string | null;
    width: number | null;
    height: number | null;
  };
  type LinkRow = {
    post_id: string;
    sort_order: number | null;
    scheduler_media: MediaRow | MediaRow[] | null;
  };

  const mediaByPost = new Map<
    string,
    { sort_order: number; media: MediaRow }[]
  >();
  for (const row of (mediaLinks ?? []) as LinkRow[]) {
    const m = Array.isArray(row.scheduler_media)
      ? row.scheduler_media[0]
      : row.scheduler_media;
    if (!m) continue;
    const arr = mediaByPost.get(row.post_id) ?? [];
    arr.push({ sort_order: row.sort_order ?? 0, media: m });
    mediaByPost.set(row.post_id, arr);
  }

  // Build content_drop_videos rows for bulk insert. order_index reflects
  // the chronological position of the post within this share (just by
  // input order — the viewer re-sorts by scheduled_at anyway).
  const dropVideoRows = opts.postIds.map((postId, idx) => {
    const postType = postTypeById.get(postId);
    const isImage = postType === 'image' || postType === 'carousel';
    const items = mediaByPost.get(postId) ?? [];
    const first = items[0]?.media;

    return {
      drop_id: opts.dropId,
      scheduled_post_id: postId,
      media_type: isImage ? 'image' : 'video',
      // Drive ingest fills these; calendar-share leaves them null
      // (migration 259 made both nullable).
      drive_file_id: null,
      drive_file_name: first?.filename ?? null,
      video_url: isImage ? null : resolveMediaUrl(admin, first),
      thumbnail_url: first?.thumbnail_url ?? null,
      mime_type: first?.mime_type ?? null,
      order_index: idx,
      status: 'ready' as const,
    };
  });

  if (dropVideoRows.length === 0) return;

  const { data: insertedVideos, error: videoErr } = await admin
    .from('content_drop_videos')
    .insert(dropVideoRows)
    .select('id, scheduled_post_id, media_type');
  if (videoErr || !insertedVideos) {
    throw new Error(
      videoErr?.message ?? 'Failed to mirror posts into content_drop_videos',
    );
  }

  // For image/carousel posts, fan out the scheduler_media items into
  // content_drop_post_assets so the viewer's carousel renders. Position
  // mirrors scheduled_post_media.sort_order so the order is stable.
  const assetRows: Array<{
    drop_video_id: string;
    drive_file_id: string;
    drive_file_name: string;
    asset_url: string | null;
    thumbnail_url: string | null;
    mime_type: string | null;
    width: number | null;
    height: number | null;
    position: number;
    status: 'ready';
  }> = [];
  for (const v of insertedVideos as Array<{
    id: string;
    scheduled_post_id: string;
    media_type: string;
  }>) {
    if (v.media_type !== 'image') continue;
    const items = mediaByPost.get(v.scheduled_post_id) ?? [];
    items.forEach((item, i) => {
      assetRows.push({
        drop_video_id: v.id,
        // drive_file_id / drive_file_name are NOT NULL on
        // content_drop_post_assets (migration 238) — synthesize a stable
        // value from the scheduler_media id so re-mints are idempotent.
        drive_file_id: `scheduler-media-${item.media.id}`,
        drive_file_name: item.media.filename ?? `asset-${i + 1}`,
        asset_url: resolveMediaUrl(admin, item.media),
        thumbnail_url: item.media.thumbnail_url,
        mime_type: item.media.mime_type,
        width: item.media.width,
        height: item.media.height,
        position: i,
        status: 'ready',
      });
    });
  }

  if (assetRows.length > 0) {
    const { error: assetErr } = await admin
      .from('content_drop_post_assets')
      .insert(assetRows);
    if (assetErr) {
      throw new Error(
        assetErr.message ?? 'Failed to mirror image assets into content_drop_post_assets',
      );
    }
  }
}

/**
 * Build a public, browser-renderable URL for a scheduler_media row.
 * Prefer the Late CDN URL when present (already public + warmed); fall
 * back to a Supabase storage public URL built from storage_path.
 */
function resolveMediaUrl(
  admin: SupabaseClient,
  media: { late_media_url: string | null; storage_path: string | null } | undefined,
): string | null {
  if (!media) return null;
  if (media.late_media_url) return media.late_media_url;
  if (!media.storage_path) return null;
  if (/^https?:\/\//i.test(media.storage_path)) return media.storage_path;
  const { data } = admin.storage
    .from('scheduler-media')
    .getPublicUrl(media.storage_path);
  return data.publicUrl;
}
