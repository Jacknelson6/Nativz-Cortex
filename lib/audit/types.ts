/** Types for the Sales Audit feature */

export type AuditPlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'linkedin';

export interface ProspectProfile {
  platform: AuditPlatform;
  username: string;
  displayName: string;
  bio: string;
  followers: number;
  following: number;
  likes: number;
  postsCount: number;
  avatarUrl: string | null;
  profileUrl: string;
  verified: boolean;
}

export interface ProspectVideo {
  id: string;
  platform: AuditPlatform;
  description: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  bookmarks: number;
  duration: number | null;
  publishDate: string | null;
  hashtags: string[];
  url: string;
  thumbnailUrl: string | null;
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatar: string | null;
  authorFollowers: number;
}

export interface WebsiteContext {
  url: string;
  title: string;
  description: string;
  industry: string;
  keywords: string[];
  socialLinks: SocialLink[];
}

export interface SocialLink {
  platform: AuditPlatform;
  url: string;
  username: string;
}

export interface PlatformReport {
  platform: AuditPlatform;
  profile: ProspectProfile;
  videos: ProspectVideo[];
  engagementRate: number;
  avgViews: number;
  postingFrequency: string;
  gemini_grades?: GeminiGrades;
}

export interface CompetitorProfile {
  username: string;
  displayName: string;
  platform: AuditPlatform;
  followers: number;
  avatarUrl: string | null;
  profileUrl: string;
  engagementRate: number;
  avgViews: number;
  postingFrequency: string;
  recentVideos: ProspectVideo[];
  gemini_grades?: GeminiGrades;
}

export type ScoreStatus = 'good' | 'warning' | 'poor';

export interface ScorecardItem {
  category: string;
  label: string;
  prospectStatus: ScoreStatus;
  prospectValue: string;
  competitors: {
    username: string;
    status: ScoreStatus;
    value: string;
  }[];
  description: string;
  /** Short machine-written "why" for tooltips + callout cards. */
  status_reason?: string;
}

export interface AuditScorecard {
  overallScore: number;
  items: ScorecardItem[];
  summary: string;
}

export interface AuditReport {
  websiteContext: WebsiteContext | null;
  platforms: PlatformReport[];
  competitors: CompetitorProfile[];
  scorecard: AuditScorecard;
  socialGoals?: string[];
}

/** Per-platform failure captured during scrape so the UI can surface which
 *  platforms silently dropped out and why. */
export interface FailedPlatform {
  platform: AuditPlatform;
  url: string;
  error: string;
}

/**
 * 13 scorecard categories, grouped for adjacency in the UI.
 * - `_account` suffix denotes account-level rows (not evaluated per-platform).
 */
export type ScorecardCategory =
  // Performance
  | 'engagement_rate'
  | 'avg_views'
  | 'follower_to_view'
  // Cadence
  | 'posting_frequency'
  | 'cadence_trend'
  // Content execution (Gemini-graded)
  | 'content_variety'
  | 'content_quality'
  | 'hook_consistency'
  // Copy & metadata
  | 'caption_optimization'
  | 'hashtag_strategy'
  // Profile & conversion (account-level)
  | 'bio_optimization_account'
  | 'cta_intent_account'
  // Strategy (account-level)
  | 'platform_focus_account';

/** Cadence direction tokens — used in status_reason + callouts. */
export type CadenceDirection = 'up' | 'flat' | 'down';

/** Per-platform Gemini-derived grades. Populated after video analysis. */
export interface GeminiGrades {
  hook_consistency: { percentage: number; status: ScoreStatus };
  content_variety: { count: number; status: ScoreStatus };
  content_quality: { avg: number; status: ScoreStatus };
}
