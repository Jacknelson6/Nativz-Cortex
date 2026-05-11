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
