export type VersusPlatformId = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'linkedin';

export interface VersusPlatformSummary {
  platform: VersusPlatformId;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  followers: number;
  avgViews: number;
  engagementRate: number;
  postingFrequency: string;
}

export interface VersusAuditRow {
  id: string;
  created_at: string;
  attached_client_id: string | null;
  attached_client_name: string | null;
  brand_name: string;
  favicon: string | null;
  platforms: VersusPlatformSummary[];
}
