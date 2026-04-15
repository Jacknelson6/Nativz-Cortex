/** Types for the Sales Audit feature */

export type AuditPlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'linkedin';

export interface ProspectProfile {
  platform: AuditPlatform;
  username: string;
  displayName: string;
  bio: string;
  followers: number;
  /**
   * Accounts the profile follows. TikTok + IG + FB report this directly;
   * YouTube Data API doesn't expose it for non-owner channels (stays 0).
   */
  following: number;
  /**
   * Lifetime "likes" — semantics differ by platform. TikTok = aggregate
   * hearts across all videos; Facebook = page-likes (a soft-follower
   * count); Instagram + YouTube don't expose a lifetime total and read
   * as 0. Don't use this for cross-platform comparison — use per-video
   * engagement math off the `videos` array instead.
   */
  likes: number;
  /** Lifetime post/video count on the profile. Not the scrape window. */
  postsCount: number;
  avatarUrl: string | null;
  profileUrl: string;
  /**
   * Verified / official-badge status when available. YouTube Data API
   * doesn't expose a verification flag, so YouTube profiles always read
   * `false` — prefer displaying the badge only when true rather than
   * implying "unverified" on a platform that never tells us.
   */
  verified: boolean;
  /**
   * External URLs in the profile. Populated from platform-specific fields
   * (IG `externalUrl` + `bio_links`, TikTok `bioLink`, FB `website`) and
   * augmented with URL extraction from the bio text as a fallback so we
   * catch accounts that inline their links rather than using the dedicated
   * link slot. Empty array when the profile has none. Always present for
   * shape consistency across platforms.
   */
  bioLinks: string[];
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
  /** Geographic scope — drives whether competitor discovery returns local vs national brands. */
  scope?: 'local' | 'national';
  /** City + state/region when scope is 'local' (e.g. "Carrollton, TX"). Null otherwise. */
  location?: string | null;
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
  /** Bio text — feeds the 30-day brief and "what they stand for" prompts. */
  bio: string;
  /** External URLs from the bio or platform link slot. */
  bioLinks: string[];
  gemini_grades?: GeminiGrades;
  /**
   * True when we surfaced this competitor as a known brand but the scrape
   * failed (website unreachable, no socials found, platform scrape 403'd).
   * UI should show "Data unavailable" instead of 0-valued metrics so the
   * report doesn't mislead clients into thinking the competitor has no
   * engagement.
   */
  isStub?: boolean;
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
