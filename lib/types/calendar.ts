export type DropStatus =
  | 'ingesting'
  | 'analyzing'
  | 'generating'
  | 'ready'
  | 'scheduled'
  | 'failed';

export type DropVideoStatus =
  | 'pending'
  | 'downloading'
  | 'analyzing'
  | 'caption_pending'
  | 'ready'
  | 'failed';

export interface ContentDrop {
  id: string;
  client_id: string;
  created_by: string;
  drive_folder_url: string;
  drive_folder_id: string;
  status: DropStatus;
  start_date: string;
  end_date: string;
  default_post_time: string;
  total_videos: number;
  processed_videos: number;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
}

// Lightweight per-video context: transcript + thumbnail are enough for caption
// generation. We don't ask a multimodal model to "understand" the whole video
// — Whisper transcribes audio, the thumbnail is read by the caption model
// directly, and the brand's CTA + hashtag boilerplate handles the rest.
//
// Stored in `content_drop_videos.gemini_context` (JSONB column kept for
// backwards compatibility with older drops; the column name is a legacy of
// the previous Gemini-multimodal pipeline).
export interface VideoContext {
  transcript: string;
  // BCP-47 lowercase, e.g. "en" | "es". Defaults to "en" for muted videos.
  language: string;
  has_audio: boolean;
  degraded?: boolean;
}

/** @deprecated Use VideoContext. Older drops written before the rewrite still
 *  carry this richer shape; the generator only reads the new fields. */
export type GeminiContext = VideoContext;

/**
 * Per-platform caption overrides. Keys correspond to SocialPlatform values
 * the brand actually targets — `tiktok | instagram | youtube | facebook`.
 * Empty string or missing key falls back to draft_caption at schedule time.
 */
export type CaptionVariantPlatform = 'tiktok' | 'instagram' | 'youtube' | 'facebook';
export type CaptionVariants = Partial<Record<CaptionVariantPlatform, string>>;

export interface ContentDropVideo {
  id: string;
  drop_id: string;
  scheduled_post_id: string | null;
  drive_file_id: string;
  drive_file_name: string;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  gemini_file_uri: string | null;
  gemini_context: GeminiContext | null;
  caption_score: number | null;
  caption_iterations: number;
  draft_caption: string | null;
  draft_hashtags: string[];
  draft_scheduled_at: string | null;
  caption_variants: CaptionVariants;
  order_index: number;
  status: DropVideoStatus;
  error_detail: string | null;
  created_at: string;
}

export interface ContentDropShareLink {
  id: string;
  drop_id: string;
  token: string;
  included_post_ids: string[];
  post_review_link_map: Record<string, string>;
  expires_at: string;
  created_at: string;
  last_viewed_at: string | null;
}

export interface CaptionGrade {
  total: number;
  body_length: number;
  cta_separation: number;
  hashtag_relevance: number;
  voice_match: number;
  reasons: string[];
}
