export type CompetitorReportPlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube';
export type CompetitorReportCadence = 'weekly' | 'biweekly' | 'monthly';

export interface CompetitorReportTopPost {
  id?: string;
  url?: string;
  thumbnail_url?: string | null;
  description?: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  publish_date?: string | null;
}

export interface CompetitorReportCompetitor {
  username: string;
  display_name: string | null;
  platform: CompetitorReportPlatform;
  profile_url: string | null;

  followers: number | null;
  followers_delta: number | null;
  posts_count: number | null;
  posts_count_delta: number | null;
  avg_views: number | null;
  avg_views_delta: number | null;
  engagement_rate: number | null;
  engagement_rate_delta: number | null;
  posting_frequency: string | null;

  top_posts: CompetitorReportTopPost[];
  follower_series: Array<{ captured_at: string; followers: number | null }>;

  snapshot_captured_at: string | null;
  scrape_error: string | null;
}

export interface CompetitorReportData {
  subscription_id: string;
  client_id: string;
  client_name: string;
  client_agency: 'nativz' | 'anderson' | string;
  organization_id: string | null;

  cadence: CompetitorReportCadence;
  period_start: string;
  period_end: string;

  competitors: CompetitorReportCompetitor[];

  generated_at: string;
}
