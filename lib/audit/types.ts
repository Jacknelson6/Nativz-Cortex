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
}
