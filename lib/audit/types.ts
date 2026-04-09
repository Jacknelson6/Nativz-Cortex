/** Types for the Sales Audit feature */

export interface ProspectProfile {
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
}

export interface ProspectData {
  profile: ProspectProfile;
  recentVideos: ProspectVideo[];
  websiteContext: WebsiteContext | null;
  engagementRate: number;
  avgViews: number;
  postingFrequency: string;
}

export interface WebsiteContext {
  url: string;
  title: string;
  description: string;
  industry: string;
  keywords: string[];
}

export interface CompetitorProfile {
  username: string;
  displayName: string;
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
  prospect: ProspectData;
  competitors: CompetitorProfile[];
  scorecard: AuditScorecard;
}
