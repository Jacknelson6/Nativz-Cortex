/**
 * VFF-03 shared types for the discovery pipeline.
 *
 * `DiscoveredVideo` is the normalized shape every source adapter
 * (tiktok/instagram/youtube) returns. It maps 1:1 onto a `viral_videos` row
 * minus the analysis columns (filled by VFF-04 / VFF-05).
 */

export type DiscoveryPlatform = 'tiktok' | 'instagram' | 'youtube';

export type DiscoveredVideo = {
  platform: DiscoveryPlatform;
  source_url: string;
  source_url_hash: string;
  external_post_id: string | null;
  creator_handle: string | null;
  creator_display_name: string | null;
  thumbnail_source_url: string | null;
  duration_seconds: number | null;
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  posted_at: string | null;
  raw_payload: Record<string, unknown>;
};

export type DiscoverySignal =
  | 'ok'
  | 'creators_empty'
  | 'keywords_empty'
  | 'failed'
  | 'quota_exhausted'
  | 'budget_capped'
  | 'no_context';

export type DiscoveryResult = {
  videos: DiscoveredVideo[];
  cost_usd: number;
  error?: string;
  signal: DiscoverySignal;
};
