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
  platforms: { platform: SocialPlatform; profile_id: string; username: string }[];
  review_status: 'none' | 'pending' | 'approved' | 'changes_requested';
  media: { id: string; filename: string; storage_path: string; thumbnail_url: string | null; late_media_url: string | null; mime_type: string | null }[];
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
};

export const DEFAULT_POSTING_TIME = '12:00';
export const DEFAULT_POSTING_TIMEZONE = 'America/Chicago';
