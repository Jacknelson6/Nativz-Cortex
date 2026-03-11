import type { SocialPlatform } from '@/lib/posting/types';
export type { SocialPlatform } from '@/lib/posting/types';

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'partially_failed' | 'failed';
export type PlatformPostStatus = 'pending' | 'publishing' | 'published' | 'failed';
export type PostType = 'reel' | 'short' | 'video';
export type ReviewCommentStatus = 'approved' | 'changes_requested' | 'comment';

export interface SocialProfileRow {
  id: string;
  client_id: string;
  platform: SocialPlatform;
  platform_user_id: string;
  username: string;
  avatar_url: string | null;
  access_token_ref: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduledPostRow {
  id: string;
  client_id: string;
  created_by: string | null;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  caption: string;
  hashtags: string[];
  cover_image_url: string | null;
  tagged_people: string[];
  collaborator_handles: string[];
  post_type: PostType;
  external_post_id: string | null;
  failure_reason: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduledPostPlatformRow {
  id: string;
  post_id: string;
  social_profile_id: string;
  status: PlatformPostStatus;
  external_post_id: string | null;
  external_post_url: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface SchedulerMediaRow {
  id: string;
  client_id: string;
  uploaded_by: string | null;
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
}

export interface ScheduledPostMediaRow {
  id: string;
  post_id: string;
  media_id: string;
  sort_order: number;
}

export interface SavedCaptionRow {
  id: string;
  client_id: string;
  created_by: string | null;
  title: string;
  caption_text: string;
  hashtags: string[];
  created_at: string;
}

export interface PostReviewLinkRow {
  id: string;
  post_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface PostReviewCommentRow {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: ReviewCommentStatus;
  created_at: string;
}

// Expanded types with joins for the UI

export interface ScheduledPostWithDetails extends ScheduledPostRow {
  platforms: (ScheduledPostPlatformRow & {
    social_profile: SocialProfileRow;
  })[];
  media: (ScheduledPostMediaRow & {
    scheduler_media: SchedulerMediaRow;
  })[];
  review_links: PostReviewLinkRow[];
  review_status: 'none' | 'pending' | 'approved' | 'changes_requested';
}

export interface CalendarPost {
  id: string;
  client_id: string;
  status: PostStatus;
  scheduled_at: string | null;
  caption: string;
  post_type: PostType;
  cover_image_url: string | null;
  thumbnail_url: string | null;
  platforms: SocialPlatform[];
  review_status: 'none' | 'pending' | 'approved' | 'changes_requested';
}
