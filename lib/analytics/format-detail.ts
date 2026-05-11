// VFF-09: server helper that builds the full detail payload for a
// single viral_video. Wraps:
//   - viral_videos row
//   - viral_video_formats × viral_formats (4 dimensions + confidence)
//   - top 5 comments from raw_payload.top_comments
//   - competitor match (client_competitors.username == creator_handle)
//   - per-brand saved / pinned / dismissed flags
//
// The flag derivation is intentionally chatty: we use createAdminClient()
// to bypass RLS so the strategist UI can show is_pinned for any brand
// they're viewing, not just the active membership.

import { createAdminClient } from '@/lib/supabase/admin';

export type FormatDetailDimension = {
  kind: 'hook_type' | 'structure' | 'archetype' | 'pacing';
  slug: string;
  display_name: string;
  confidence: number | null;
};

export type FormatDetailComment = {
  text: string;
  likes: number;
  author: string | null;
};

export type FormatDetailVideo = {
  id: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  source_url: string;
  external_post_id: string | null;
  creator_handle: string | null;
  creator_display_name: string | null;
  thumbnail_storage_url: string | null;
  thumbnail_source_url: string | null;
  duration_seconds: number | null;
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  posted_at: string | null;
  title: string | null;
  engagement_hook_descriptor: string | null;
  why_it_works: string | null;
  retention_pattern: string | null;
  analysis_status: string;
  raw_payload_top_comments: FormatDetailComment[];
  formats: FormatDetailDimension[];
};

export type FormatDetailBrandContext = {
  client_id: string | null;
  competitor_match: { handle: string; competitor_id: string } | null;
  is_saved: boolean;
  is_pinned: boolean;
  is_dismissed: boolean;
};

export type FormatDetailPayload = {
  video: FormatDetailVideo;
  brand_context: FormatDetailBrandContext | null;
};

const COMMENT_KEYS = ['top_comments', 'comments_sample', 'comments'] as const;

// Returns null when the video doesn't exist. Caller turns that into 404.
export async function getFormatDetail(
  videoId: string,
  viewerClientId: string | null,
  viewerUserId: string | null,
): Promise<FormatDetailPayload | null> {
  const admin = createAdminClient();

  const { data: video } = await admin
    .from('viral_videos')
    .select(
      'id, platform, source_url, external_post_id, creator_handle, creator_display_name, thumbnail_storage_url, thumbnail_source_url, duration_seconds, views_count, likes_count, comments_count, shares_count, posted_at, title, engagement_hook_descriptor, why_it_works, retention_pattern, analysis_status, raw_payload',
    )
    .eq('id', videoId)
    .maybeSingle();
  if (!video) return null;
  const v = video as {
    id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    source_url: string;
    external_post_id: string | null;
    creator_handle: string | null;
    creator_display_name: string | null;
    thumbnail_storage_url: string | null;
    thumbnail_source_url: string | null;
    duration_seconds: number | null;
    views_count: number | null;
    likes_count: number | null;
    comments_count: number | null;
    shares_count: number | null;
    posted_at: string | null;
    title: string | null;
    engagement_hook_descriptor: string | null;
    why_it_works: string | null;
    retention_pattern: string | null;
    analysis_status: string;
    raw_payload: Record<string, unknown> | null;
  };

  // 4-dimension chips. join through viral_video_formats.
  const [{ data: links }, brandFlags, competitorMatch] = await Promise.all([
    admin
      .from('viral_video_formats')
      .select('format_id, confidence')
      .eq('video_id', videoId),
    loadBrandFlags(admin, videoId, viewerClientId, viewerUserId),
    loadCompetitorMatch(admin, viewerClientId, v.creator_handle),
  ]);

  const formatRows: FormatDetailDimension[] = [];
  if (links?.length) {
    const ids = (links as Array<{ format_id: string; confidence: number | null }>).map((l) => l.format_id);
    const { data: formats } = await admin
      .from('viral_formats')
      .select('id, kind, slug, display_name')
      .in('id', ids);
    const lookup = new Map<string, { kind: FormatDetailDimension['kind']; slug: string; display_name: string }>();
    for (const f of (formats ?? []) as Array<{ id: string; kind: FormatDetailDimension['kind']; slug: string; display_name: string }>) {
      lookup.set(f.id, { kind: f.kind, slug: f.slug, display_name: f.display_name });
    }
    for (const link of links as Array<{ format_id: string; confidence: number | null }>) {
      const hit = lookup.get(link.format_id);
      if (hit) formatRows.push({ ...hit, confidence: link.confidence });
    }
  }

  return {
    video: {
      id: v.id,
      platform: v.platform,
      source_url: v.source_url,
      external_post_id: v.external_post_id,
      creator_handle: v.creator_handle,
      creator_display_name: v.creator_display_name,
      thumbnail_storage_url: v.thumbnail_storage_url,
      thumbnail_source_url: v.thumbnail_source_url,
      duration_seconds: v.duration_seconds,
      views_count: v.views_count,
      likes_count: v.likes_count,
      comments_count: v.comments_count,
      shares_count: v.shares_count,
      posted_at: v.posted_at,
      title: v.title,
      engagement_hook_descriptor: v.engagement_hook_descriptor,
      why_it_works: v.why_it_works,
      retention_pattern: v.retention_pattern,
      analysis_status: v.analysis_status,
      raw_payload_top_comments: extractTopComments(v.raw_payload),
      formats: formatRows,
    },
    brand_context:
      viewerClientId == null
        ? null
        : {
            client_id: viewerClientId,
            competitor_match: competitorMatch,
            is_saved: brandFlags.is_saved,
            is_pinned: brandFlags.is_pinned,
            is_dismissed: brandFlags.is_dismissed,
          },
  };
}

async function loadBrandFlags(
  admin: ReturnType<typeof createAdminClient>,
  videoId: string,
  clientId: string | null,
  userId: string | null,
): Promise<{ is_saved: boolean; is_pinned: boolean; is_dismissed: boolean }> {
  const result = { is_saved: false, is_pinned: false, is_dismissed: false };
  if (!clientId) return result;

  // Per-brand pin collection.
  const { data: pinCollection } = await admin
    .from('viral_collections')
    .select('id')
    .eq('client_id', clientId)
    .eq('name', 'Pinned')
    .maybeSingle();
  if (pinCollection) {
    const { data: pin } = await admin
      .from('viral_collection_videos')
      .select('video_id')
      .eq('collection_id', (pinCollection as { id: string }).id)
      .eq('video_id', videoId)
      .maybeSingle();
    if (pin) result.is_pinned = true;
  }

  // Per-user save collection (client_id IS NULL).
  if (userId) {
    const { data: saveCollection } = await admin
      .from('viral_collections')
      .select('id')
      .is('client_id', null)
      .eq('created_by', userId)
      .eq('name', 'Saved')
      .maybeSingle();
    if (saveCollection) {
      const { data: save } = await admin
        .from('viral_collection_videos')
        .select('video_id')
        .eq('collection_id', (saveCollection as { id: string }).id)
        .eq('video_id', videoId)
        .maybeSingle();
      if (save) result.is_saved = true;
    }
  }

  const { data: dismissed } = await admin
    .from('viral_video_brand_dismissals')
    .select('video_id')
    .eq('video_id', videoId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (dismissed) result.is_dismissed = true;

  return result;
}

async function loadCompetitorMatch(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string | null,
  creatorHandle: string | null,
): Promise<{ handle: string; competitor_id: string } | null> {
  if (!clientId || !creatorHandle) return null;
  const normalized = creatorHandle.toLowerCase().replace(/^@/, '');
  const { data } = await admin
    .from('client_competitors')
    .select('id, username')
    .eq('client_id', clientId);
  if (!data?.length) return null;
  for (const row of data as Array<{ id: string; username: string | null }>) {
    if (!row.username) continue;
    const candidate = row.username.toLowerCase().replace(/^@/, '');
    if (candidate === normalized) {
      return { handle: row.username, competitor_id: row.id };
    }
  }
  return null;
}

// Top 5 comments from raw_payload. Sources vary by scraper, so accept
// a few likely keys and normalize.
function extractTopComments(raw: Record<string, unknown> | null): FormatDetailComment[] {
  if (!raw) return [];
  for (const key of COMMENT_KEYS) {
    const value = raw[key];
    if (Array.isArray(value)) {
      const normalized = value
        .map((c) => normalizeComment(c))
        .filter((c): c is FormatDetailComment => c !== null)
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 5);
      if (normalized.length) return normalized;
    }
  }
  return [];
}

function normalizeComment(input: unknown): FormatDetailComment | null {
  if (!input || typeof input !== 'object') return null;
  const c = input as Record<string, unknown>;
  const text = typeof c.text === 'string' ? c.text : typeof c.body === 'string' ? c.body : null;
  if (!text) return null;
  const likes = typeof c.likes === 'number' ? c.likes : typeof c.like_count === 'number' ? c.like_count : 0;
  const author = typeof c.author === 'string' ? c.author : typeof c.username === 'string' ? c.username : null;
  return { text, likes, author };
}

export const __TEST__ = { extractTopComments, normalizeComment };
