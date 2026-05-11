// VFF + analytics domain types. Mirrors Supabase tables.
// Source of truth is the migration files in supabase/migrations.
// Hand-maintained because the codebase does not generate Database types.

// ============================================================
// Viral Format Finder (VFF) — migration 273
// ============================================================

export type ViralFormatKind = 'hook_type' | 'structure' | 'archetype' | 'pacing';

export interface ViralFormat {
  id: string;
  kind: ViralFormatKind;
  slug: string;
  display_name: string;
  description: string | null;
  is_seeded: boolean;
  created_at: string;
  updated_at: string;
}

export type ViralVideoPlatform = 'tiktok' | 'instagram' | 'youtube';

export type ViralVideoAnalysisStatus =
  | 'pending'
  | 'analyzing'
  | 'analyzed'
  | 'rejected'
  | 'failed';

// VFF-04: re-export so consumers can import RejectReason from
// `lib/analytics/types`. Canonical definition lives in
// `lib/analytics/reject-reasons.ts`.
export type { RejectReason } from '@/lib/analytics/reject-reasons';

export interface ViralVideo {
  id: string;
  platform: ViralVideoPlatform;
  source_url: string;
  source_url_hash: string;
  external_post_id: string | null;
  creator_handle: string | null;
  creator_display_name: string | null;
  thumbnail_source_url: string | null;
  thumbnail_storage_url: string | null;
  thumbnail_persisted_at: string | null;
  duration_seconds: number | null;
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  posted_at: string | null;
  raw_payload: Record<string, unknown>;
  analysis_status: ViralVideoAnalysisStatus;
  reject_reason: string | null;
  analyzed_at: string | null;
  title: string | null;
  engagement_hook_descriptor: string | null;
  why_it_works: string | null;
  retention_pattern: string | null;
  // embedding is a pgvector column; rarely loaded into the client. Keep optional.
  embedding?: number[] | null;
  created_at: string;
  updated_at: string;
}

export type ViralVideoFormatSource = 'llm' | 'human' | 'seed';

export interface ViralVideoFormat {
  video_id: string;
  format_id: string;
  confidence: number | null;
  source: ViralVideoFormatSource;
  created_at: string;
}

export interface ViralCollection {
  id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ViralCollectionVideo {
  collection_id: string;
  video_id: string;
  pinned_at: string;
  notes: string | null;
}

// ============================================================
// ZNA-01 — Analytics source routing (migration 278)
// ============================================================

export type AnalyticsSource = 'zernio' | 'scrape' | 'apify';

export type AnalyticsPlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube';

export interface SourceResolution {
  source: AnalyticsSource;
  source_version: string;
  reason:
    | 'zernio_connected'
    | 'scrape_fallback'
    | 'apify_fallback'
    | 'no_profile';
}

export interface PlatformSnapshotInsert {
  client_id: string;
  social_profile_id: string;
  platform: AnalyticsPlatform;
  snapshot_date: string; // YYYY-MM-DD UTC
  follower_count: number | null;
  following_count?: number | null;
  post_count?: number | null;
  engagement_rate?: number | null;
  reach?: number | null;
  impressions?: number | null;
  profile_views?: number | null;
  source: AnalyticsSource;
  source_version: string;
  captured_at?: string;
}

export interface PostMetricInsert {
  client_id: string;
  social_profile_id: string;
  platform: AnalyticsPlatform;
  external_post_id: string;
  posted_at: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  watch_time_seconds?: number | null;
  source: AnalyticsSource;
  source_version: string;
}

// ============================================================
// VFF-02 — Brand-aware ingestion signals (migration 274)
// ============================================================

export type BrandFormatContextSource = 'auto' | 'manual' | 'mixed';

export interface BrandFormatReferenceCreatorHandles {
  tiktok: string[];
  instagram: string[];
  youtube: string[];
}

export interface BrandFormatContext {
  id: string;
  client_id: string;
  seed_terms: string[];
  excluded_terms: string[];
  reference_creator_handles: BrandFormatReferenceCreatorHandles;
  pillar_weights: Record<string, number>;
  tone_descriptors: string[];
  seed_embedding?: number[] | null;
  source: BrandFormatContextSource;
  last_recomputed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformSnapshotErrorRow {
  id: string;
  client_id: string | null;
  social_profile_id: string | null;
  platform: AnalyticsPlatform;
  attempted_source: AnalyticsSource;
  error_code: string | null;
  error_message: string | null;
  attempted_at: string;
}
