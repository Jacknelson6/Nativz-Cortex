/**
 * Pipeline loader: derive the in-flight state of every deliverable for a
 * client without introducing a new table. Each `content_drop_videos` row
 * (the canonical "edited video deliverable" surface) gets bucketed into
 * one of five states based on existing fields.
 *
 * State machine:
 *   • Unstarted   - drop video exists, no `revised_video_url` yet
 *   • In edit     - revised upload landed, no review comment yet
 *   • In review   - revised upload + at least one non-approved review
 *                   comment in the last 7 days (the "live conversation"
 *                   window; older non-approved threads count as in_edit
 *                   so the pipeline stays current)
 *   • Approved    - a `consume` row exists for this drop_video
 *   • Delivered   - the linked scheduled_post.status === 'published'
 *
 * Approved + Delivered are non-mutually-exclusive in the DB, but the UI
 * only shows the most progressed bucket: a published deliverable shows
 * up under Delivered, not Approved.
 *
 * Phase C scope: edited videos only. UGC + static graphics get pipelines
 * once those types have physical artifact tables (see PRD non-goals).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type PipelineBucket =
  | 'unstarted'
  | 'in_edit'
  | 'in_review'
  | 'approved'
  | 'delivered';

export interface PipelineCard {
  /** Stable key for React lists. Currently the content_drop_videos.id. */
  id: string;
  bucket: PipelineBucket;
  title: string | null;
  /** Short caption preview for cards without an explicit title. */
  captionPreview: string | null;
  thumbnailUrl: string | null;
  /** auth.users.id of the editor who pushed the latest revision, or NULL. */
  editorUserId: string | null;
  /** ISO timestamp used to drive the "Updated 2h ago" relative line. */
  updatedAt: string;
  scheduledPostId: string | null;
  /** Always 'edited_video' in v1. */
  deliverableTypeSlug: 'edited_video';
}

export interface PipelineSnapshot {
  cards: PipelineCard[];
  /** Per-bucket counts. Useful for header chips without re-iterating cards. */
  counts: Record<PipelineBucket, number>;
}

interface DropVideoRow {
  id: string;
  drop_id: string;
  scheduled_post_id: string | null;
  drive_file_name: string | null;
  draft_caption: string | null;
  thumbnail_url: string | null;
  revised_video_url: string | null;
  revised_video_uploaded_at: string | null;
  revised_video_uploaded_by: string | null;
  created_at: string;
}

interface PostRow {
  id: string;
  status: string | null;
  title: string | null;
}

interface ReviewLinkRow {
  id: string;
  drop_id: string;
  post_review_link_map: Record<string, string> | null;
}

interface CommentRow {
  review_link_id: string;
  status: string;
  created_at: string;
}

interface ConsumeRow {
  charge_unit_id: string;
}

const REVIEW_WINDOW_DAYS = 7;

export async function getDeliverablePipeline(
  admin: SupabaseClient,
  clientId: string,
): Promise<PipelineSnapshot> {
  // Anchor on drop videos rather than scheduled_posts: the deliverable is
  // the artifact, and one drop_video can be re-scheduled across multiple
  // posts (we count it once).
  const { data: drops } = await admin
    .from('content_drops')
    .select('id')
    .eq('client_id', clientId)
    .returns<Array<{ id: string }>>();

  const dropIds = (drops ?? []).map((d) => d.id);
  if (dropIds.length === 0) {
    return emptySnapshot();
  }

  const [videosResult, shareLinksResult] = await Promise.all([
    admin
      .from('content_drop_videos')
      .select(
        'id, drop_id, scheduled_post_id, drive_file_name, draft_caption, thumbnail_url, revised_video_url, revised_video_uploaded_at, revised_video_uploaded_by, created_at',
      )
      .in('drop_id', dropIds)
      .order('created_at', { ascending: false })
      .returns<DropVideoRow[]>(),
    admin
      .from('content_drop_share_links')
      .select('id, drop_id, post_review_link_map')
      .in('drop_id', dropIds)
      .returns<ReviewLinkRow[]>(),
  ]);

  const videos = videosResult.data ?? [];
  if (videos.length === 0) {
    return emptySnapshot();
  }

  const postIds = videos
    .map((v) => v.scheduled_post_id)
    .filter((v): v is string => !!v);
  const videoIds = videos.map((v) => v.id);

  // Build a postId -> reviewLinkId map by walking each share-link's
  // post_review_link_map. One post can map to multiple review links across
  // share-link versions; we keep all and dedupe later.
  const reviewLinksByPost = new Map<string, string[]>();
  for (const sl of shareLinksResult.data ?? []) {
    for (const [postId, reviewLinkId] of Object.entries(
      sl.post_review_link_map ?? {},
    )) {
      const arr = reviewLinksByPost.get(postId) ?? [];
      arr.push(reviewLinkId);
      reviewLinksByPost.set(postId, arr);
    }
  }
  const allReviewLinkIds = Array.from(
    new Set(Array.from(reviewLinksByPost.values()).flat()),
  );

  const [postsResult, commentsResult, consumesResult] = await Promise.all([
    postIds.length > 0
      ? admin
          .from('scheduled_posts')
          .select('id, status, title')
          .in('id', postIds)
          .returns<PostRow[]>()
      : Promise.resolve({ data: [] as PostRow[] }),
    allReviewLinkIds.length > 0
      ? admin
          .from('post_review_comments')
          .select('review_link_id, status, created_at')
          .in('review_link_id', allReviewLinkIds)
          .returns<CommentRow[]>()
      : Promise.resolve({ data: [] as CommentRow[] }),
    videoIds.length > 0
      ? admin
          .from('credit_transactions')
          .select('charge_unit_id')
          .eq('client_id', clientId)
          .eq('kind', 'consume')
          .eq('charge_unit_kind', 'drop_video')
          .in('charge_unit_id', videoIds)
          .returns<ConsumeRow[]>()
      : Promise.resolve({ data: [] as ConsumeRow[] }),
  ]);

  const postById = new Map(
    (postsResult.data ?? []).map((p) => [p.id, p] as const),
  );
  const consumedDropVideoIds = new Set(
    (consumesResult.data ?? []).map((c) => c.charge_unit_id),
  );
  // Group comments by review_link_id once, then walk per-video.
  const commentsByReviewLink = new Map<string, CommentRow[]>();
  for (const c of commentsResult.data ?? []) {
    const arr = commentsByReviewLink.get(c.review_link_id) ?? [];
    arr.push(c);
    commentsByReviewLink.set(c.review_link_id, arr);
  }

  const reviewWindowMs = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const cards: PipelineCard[] = videos.map((v) => {
    const post = v.scheduled_post_id ? (postById.get(v.scheduled_post_id) ?? null) : null;
    const reviewLinkIds = v.scheduled_post_id
      ? (reviewLinksByPost.get(v.scheduled_post_id) ?? [])
      : [];
    const comments = reviewLinkIds.flatMap(
      (id) => commentsByReviewLink.get(id) ?? [],
    );
    const hasRecentNonApproved = comments.some(
      (c) =>
        c.status !== 'approved' &&
        now - new Date(c.created_at).getTime() <= reviewWindowMs,
    );
    const isPublished = post?.status === 'published';
    const isConsumed = consumedDropVideoIds.has(v.id);
    const hasRevised = !!v.revised_video_url;

    let bucket: PipelineBucket;
    if (isPublished) {
      bucket = 'delivered';
    } else if (isConsumed) {
      bucket = 'approved';
    } else if (hasRevised && hasRecentNonApproved) {
      bucket = 'in_review';
    } else if (hasRevised) {
      bucket = 'in_edit';
    } else {
      bucket = 'unstarted';
    }

    const updatedAt =
      v.revised_video_uploaded_at ?? v.created_at;

    return {
      id: v.id,
      bucket,
      title: post?.title ?? stripExtension(v.drive_file_name),
      captionPreview: shortenCaption(v.draft_caption),
      thumbnailUrl: v.thumbnail_url,
      editorUserId: v.revised_video_uploaded_by,
      updatedAt,
      scheduledPostId: v.scheduled_post_id,
      deliverableTypeSlug: 'edited_video',
    };
  });

  // Sort within bucket: most recent first.
  cards.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));

  const counts: Record<PipelineBucket, number> = {
    unstarted: 0,
    in_edit: 0,
    in_review: 0,
    approved: 0,
    delivered: 0,
  };
  for (const c of cards) counts[c.bucket]++;

  return { cards, counts };
}

function emptySnapshot(): PipelineSnapshot {
  return {
    cards: [],
    counts: {
      unstarted: 0,
      in_edit: 0,
      in_review: 0,
      approved: 0,
      delivered: 0,
    },
  };
}

function stripExtension(filename: string | null): string | null {
  if (!filename) return null;
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return filename;
  return filename.slice(0, dot);
}

function shortenCaption(caption: string | null): string | null {
  if (!caption) return null;
  const trimmed = caption.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}...`;
}
