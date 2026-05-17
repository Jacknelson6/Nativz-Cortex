import type { PostStatus, PostType, SocialPlatform, ReviewCommentStatus } from '@/lib/types/scheduler';

export type CalendarViewMode = 'week' | 'month' | 'list';

export interface CalendarPost {
  id: string;
  client_id: string;
  status: PostStatus;
  scheduled_at: string | null;
  caption: string;
  hashtags: string[];
  post_type: PostType;
  cover_image_url: string | null;
  thumbnail_url: string | null;
  platforms: {
    platform: SocialPlatform;
    profile_id: string;
    username: string;
    status?: 'pending' | 'published' | 'failed';
    external_post_url?: string | null;
    failure_reason?: string | null;
  }[];
  review_status: 'none' | 'pending' | 'approved' | 'revising';
  media: { id: string; filename: string; storage_path: string; thumbnail_url: string | null; late_media_url: string | null; mime_type: string | null }[];
  // Per-platform overrides (migrations 218 + 258). Hydrated from
  // /api/scheduler/posts so the post editor's Platform settings panel can
  // round-trip values without a second fetch. All optional/nullable so
  // the publisher's defaults still apply when the user hasn't set anything.
  tagged_people?: string[];
  collaborator_handles?: string[];
  first_comment?: string | null;
  instagram_share_to_feed?: boolean | null;
  instagram_content_type?: 'feed' | 'reels' | 'story' | null;
  facebook_content_type?: 'feed' | 'reel' | 'story' | null;
  facebook_page_id?: string | null;
  linkedin_document_title?: string | null;
  linkedin_organization_urn?: string | null;
  linkedin_disable_link_preview?: boolean | null;
  youtube_title?: string | null;
  youtube_description?: string | null;
  youtube_tags?: string[] | null;
  youtube_privacy?: 'public' | 'unlisted' | 'private' | null;
  youtube_made_for_kids?: boolean | null;
  tiktok_allow_comment?: boolean | null;
  tiktok_allow_duet?: boolean | null;
  tiktok_allow_stitch?: boolean | null;
}

export interface MediaItem {
  id: string;
  client_id: string;
  filename: string;
  storage_path: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  is_used: boolean;
  created_at: string;
  public_url?: string;
  late_media_url: string | null;
}

export interface ClientOption {
  id: string;
  name: string;
  slug: string;
  default_posting_time: string | null;
  default_posting_timezone: string | null;
}

export interface ConnectedProfile {
  id: string;
  platform: SocialPlatform;
  username: string;
  avatar_url: string | null;
}

export const STATUS_CONFIG: Record<PostStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }> = {
  draft: { label: 'Draft', variant: 'default' },
  scheduled: { label: 'Scheduled', variant: 'info' },
  publishing: { label: 'Publishing', variant: 'warning' },
  published: { label: 'Published', variant: 'success' },
  partially_failed: { label: 'Partial failure', variant: 'warning' },
  failed: { label: 'Failed', variant: 'danger' },
};

export const PLATFORM_ICONS: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  googlebusiness: 'Google Business',
};

// Per-platform thumbnail border colors. Picked so each chip is identifiable at
// a glance in the calendar grid — no platform icons needed for the dominant
// brands. Hex values keep the dark/light theme behaviour consistent.
export const PLATFORM_BORDER_COLOR: Record<SocialPlatform, string> = {
  facebook: '#3b82f6',     // blue-500
  instagram: '#ec4899',    // pink-500
  tiktok: '#22d3ee',       // cyan-400
  youtube: '#ef4444',      // red-500
  linkedin: '#0a66c2',     // linkedin brand
  googlebusiness: '#10b981', // emerald-500
};

export const CHIP_STATUS_LABEL: Record<PostStatus, string> = {
  draft: 'Draft',
  scheduled: 'Auto',
  publishing: 'Posting',
  published: 'Posted',
  partially_failed: 'Partial',
  failed: 'Error',
};

export const DEFAULT_POSTING_TIME = '12:00';
export const DEFAULT_POSTING_TIMEZONE = 'America/Chicago';
