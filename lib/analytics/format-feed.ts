// VFF-07: build the Netflix-style feed for /admin/formats.
// Composes 8 horizontal rows + 1 hero from the analyzed viral_videos
// table. Each row uses a different selection strategy; this helper
// keeps the SQL out of the page so we can unit-test the shape.

import { createAdminClient } from '@/lib/supabase/admin';

export type FormatFeedVideo = {
  id: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  source_url: string;
  creator_handle: string | null;
  thumbnail_storage_url: string | null;
  thumbnail_source_url: string | null;
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  posted_at: string | null;
  title: string | null;
  engagement_hook_descriptor: string | null;
  why_it_works: string | null;
  retention_pattern: string | null;
  analyzed_at: string | null;
  duration_seconds: number | null;
  brand_relevance: 'low' | 'medium' | 'high' | null;
};

export type FormatFeedRow = {
  key: string;
  label: string;
  videos: FormatFeedVideo[];
};

export type FormatFeedPayload = {
  hero: FormatFeedVideo | null;
  rows: FormatFeedRow[];
  seeding: boolean;
  analyzed_count: number;
  brand_name: string | null;
};

export interface BuildFormatFeedOpts {
  limitPerRow?: number;
}

const ROW_LIMIT = 16;
const SEEDING_THRESHOLD = 20;

const VIDEO_SELECT =
  'id, platform, source_url, creator_handle, thumbnail_storage_url, thumbnail_source_url, views_count, likes_count, comments_count, posted_at, title, engagement_hook_descriptor, why_it_works, retention_pattern, analyzed_at, duration_seconds';

function bucketRelevance(score: number | null | undefined): 'low' | 'medium' | 'high' | null {
  if (score == null) return null;
  if (score < 0.4) return 'low';
  if (score <= 0.65) return 'medium';
  return 'high';
}

function decorate(rows: unknown[]): FormatFeedVideo[] {
  return (rows as Array<FormatFeedVideo & { cosine_distance?: number | null }>).map((r) => ({
    ...r,
    // For-You rows attach `cosine_distance` via the RPC; for everyone else
    // brand_relevance stays null.
    brand_relevance: bucketRelevance(
      typeof r.cosine_distance === 'number' ? 1 - r.cosine_distance : null,
    ),
  }));
}

export async function buildFormatFeed(
  clientId: string | null,
  // Opts reserved for limit overrides + cursor pagination in VFF-08.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opts: BuildFormatFeedOpts = {},
): Promise<FormatFeedPayload> {
  const admin = createAdminClient();
  const limit = ROW_LIMIT;

  // 1. Brand context (seed_embedding + name).
  const [contextRes, brandRes, analyzedCountRes] = await Promise.all([
    clientId
      ? admin
          .from('brand_format_context')
          .select('seed_embedding')
          .eq('client_id', clientId)
          .maybeSingle()
      : Promise.resolve({ data: null } as const),
    clientId
      ? admin.from('clients').select('name').eq('id', clientId).maybeSingle()
      : Promise.resolve({ data: null } as const),
    admin
      .from('viral_videos')
      .select('id', { count: 'exact', head: true })
      .eq('analysis_status', 'analyzed'),
  ]);

  const seedEmbedding = (contextRes as { data: { seed_embedding: number[] | null } | null })
    .data?.seed_embedding ?? null;
  const brandName = (brandRes as { data: { name: string } | null }).data?.name ?? null;
  const analyzedCount = analyzedCountRes.count ?? 0;
  const seeding = analyzedCount < SEEDING_THRESHOLD || !seedEmbedding;

  // 2. Row queries (run in parallel).
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [
    forYou,
    trending,
    topHooks,
    comparison,
    pov,
    recent,
    competitors,
    saved,
  ] = await Promise.all([
    buildForYou(admin, seedEmbedding, limit),
    admin
      .from('viral_videos')
      .select(VIDEO_SELECT)
      .eq('analysis_status', 'analyzed')
      .gte('posted_at', sevenDaysAgo)
      .order('views_count', { ascending: false, nullsFirst: false })
      .limit(limit),
    admin
      .from('viral_videos')
      .select(VIDEO_SELECT)
      .eq('analysis_status', 'analyzed')
      .order('views_count', { ascending: false, nullsFirst: false })
      .limit(limit),
    buildKindRow(admin, 'structure', 'comparison', limit),
    buildKindRow(admin, 'structure', 'pov_story', limit),
    admin
      .from('viral_videos')
      .select(VIDEO_SELECT)
      .eq('analysis_status', 'analyzed')
      .order('analyzed_at', { ascending: false, nullsFirst: false })
      .limit(limit),
    buildCompetitorRow(admin, clientId, limit),
    buildSavedRow(admin, clientId, limit),
  ]);

  const rows: FormatFeedRow[] = [
    { key: 'for_you', label: 'For you', videos: decorate(forYou) },
    { key: 'trending', label: 'Trending this week', videos: decorate(trending.data ?? []) },
    { key: 'top_hooks', label: 'Top hooks', videos: decorate(topHooks.data ?? []) },
    { key: 'comparison', label: 'Comparison plays', videos: decorate(comparison) },
    { key: 'pov', label: 'POV magic', videos: decorate(pov) },
    { key: 'recent', label: 'Just analyzed', videos: decorate(recent.data ?? []) },
    { key: 'worth_stealing', label: 'Worth stealing from competitors', videos: decorate(competitors) },
    { key: 'saved', label: 'Your saved', videos: decorate(saved) },
  ];

  const hero = rows[0].videos[0] ?? rows[1].videos[0] ?? rows[2].videos[0] ?? null;

  return { hero, rows, seeding, analyzed_count: analyzedCount, brand_name: brandName };
}

async function buildForYou(
  admin: ReturnType<typeof createAdminClient>,
  seedEmbedding: number[] | null,
  limit: number,
): Promise<unknown[]> {
  if (!seedEmbedding) {
    const { data } = await admin
      .from('viral_videos')
      .select(VIDEO_SELECT)
      .eq('analysis_status', 'analyzed')
      .order('views_count', { ascending: false, nullsFirst: false })
      .limit(limit);
    return data ?? [];
  }
  // pgvector cosine ordering via RPC isn't available without a SQL function,
  // so we fall back to the same top-views query and tag relevance from the
  // embedding cosine on the application side once the RPC lands. Until then
  // For-You == Top, which is the spec's degraded fallback.
  const { data } = await admin
    .from('viral_videos')
    .select(VIDEO_SELECT)
    .eq('analysis_status', 'analyzed')
    .order('views_count', { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

async function buildKindRow(
  admin: ReturnType<typeof createAdminClient>,
  kind: 'hook_type' | 'structure' | 'archetype' | 'pacing',
  slug: string,
  limit: number,
): Promise<unknown[]> {
  const { data: format } = await admin
    .from('viral_formats')
    .select('id')
    .eq('kind', kind)
    .eq('slug', slug)
    .maybeSingle();
  if (!format) return [];
  const { data: vvf } = await admin
    .from('viral_video_formats')
    .select('video_id')
    .eq('format_id', (format as { id: string }).id)
    .limit(limit * 2);
  const ids = (vvf ?? []).map((r: { video_id: string }) => r.video_id);
  if (ids.length === 0) return [];
  const { data } = await admin
    .from('viral_videos')
    .select(VIDEO_SELECT)
    .in('id', ids)
    .eq('analysis_status', 'analyzed')
    .order('views_count', { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

async function buildCompetitorRow(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string | null,
  limit: number,
): Promise<unknown[]> {
  if (!clientId) return [];
  const { data: comps } = await admin
    .from('client_competitors')
    .select('username')
    .eq('client_id', clientId);
  const handles = (comps ?? [])
    .map((r: { username: string | null }) => r.username?.toLowerCase().replace(/^@/, ''))
    .filter((h): h is string => !!h);
  if (handles.length === 0) return [];
  const { data } = await admin
    .from('viral_videos')
    .select(VIDEO_SELECT)
    .eq('analysis_status', 'analyzed')
    .in('creator_handle', handles)
    .order('views_count', { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

async function buildSavedRow(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string | null,
  limit: number,
): Promise<unknown[]> {
  if (!clientId) return [];
  const { data: cols } = await admin
    .from('viral_collections')
    .select('id')
    .eq('client_id', clientId);
  const colIds = (cols ?? []).map((r: { id: string }) => r.id);
  if (colIds.length === 0) return [];
  const { data: pins } = await admin
    .from('viral_collection_videos')
    .select('video_id')
    .in('collection_id', colIds)
    .order('pinned_at', { ascending: false })
    .limit(limit * 2);
  const ids = (pins ?? []).map((r: { video_id: string }) => r.video_id);
  if (ids.length === 0) return [];
  const { data } = await admin
    .from('viral_videos')
    .select(VIDEO_SELECT)
    .in('id', ids)
    .order('analyzed_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

export const __TEST__ = { bucketRelevance };
