// ─── Shared types ────────────────────────────────────────────────────────────

export interface Slide {
  title: string;
  body: string;
  image_url?: string | null;
  embed_url?: string | null;
  notes?: string | null;
}

export interface TierDef {
  id: string;
  name: string;
  color: string;
}

export interface TierItem {
  id: string;
  url: string;
  title: string;
  thumbnail_url?: string | null;
  tier_id?: string | null;
  position: number;
  notes?: string | null;
}

export interface SocialProfile {
  platform: string;
  handle: string;
  display_name: string;
  bio: string;
  profile_image: string | null;
  followers: number | null;
  following: number | null;
  posts: number | null;
  engagement_rate: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_views: number | null;
  url: string;
  scraped_at: string;
  raw_description: string;
}

export interface AuditData {
  profiles: SocialProfile[];
  competitors: SocialProfile[];
  projections: Record<string, { followers_3mo: number; engagement_3mo: number; posts_per_week: number }>;
  step: 'wizard' | 'review' | 'present';
  business_name?: string;
  timeline_months?: number;
}

export interface PresentationData {
  id: string;
  title: string;
  description: string | null;
  type: 'slides' | 'tier_list' | 'social_audit';
  client_id: string | null;
  slides: Slide[];
  tiers: TierDef[];
  tier_items: TierItem[];
  audit_data: AuditData;
  status: 'draft' | 'ready' | 'archived';
  tags: string[];
}
