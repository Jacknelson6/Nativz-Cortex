/**
 * Meta Marketing API types for ads data.
 */

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

export interface MetaAdInsights {
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  ctr: string;
  cpm: string;
  cpc: string;
  cpp: string;
  frequency: string;
  unique_clicks: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  video_avg_time_watched_actions?: MetaAction[];
  video_p25_watched_actions?: MetaAction[];
  video_p50_watched_actions?: MetaAction[];
  video_p75_watched_actions?: MetaAction[];
  video_p100_watched_actions?: MetaAction[];
}

export interface MetaAction {
  action_type: string;
  value: string;
}

export interface MetaCreative {
  thumbnail_url?: string;
  title?: string;
  body?: string;
  id?: string;
}

export interface MetaAdRaw {
  id: string;
  name: string;
  status: string;
  creative?: MetaCreative;
  insights?: { data: MetaAdInsights[] };
}

export interface MetaAdSetRaw {
  id: string;
  name: string;
  status: string;
  optimization_goal?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  insights?: { data: MetaAdInsights[] };
}

export interface MetaCampaignRaw {
  id: string;
  name: string;
  status: string;
  objective?: string;
  insights?: { data: MetaAdInsights[] };
}

// ---------------------------------------------------------------------------
// Parsed / enriched shapes for the UI
// ---------------------------------------------------------------------------

export interface ParsedMetrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  frequency: number;
  hookRate: number;       // video_p25 / impressions * 100
  holdRate: number;       // video_p50 / impressions * 100
  completionRate: number; // video_p100 / impressions * 100
  roas: number;           // purchase_value / spend
  conversions: number;
  costPerLike: number;
  costPerProfileVisit: number;
}

export interface AdData {
  id: string;
  name: string;
  status: string;
  thumbnailUrl: string | null;
  creativeTitle: string | null;
  creativeBody: string | null;
  metrics: ParsedMetrics;
  performanceScore: number;
  performanceLabel: 'winning' | 'losing' | 'neutral';
  aiInsight?: string;
}

export interface AdSetData {
  id: string;
  name: string;
  status: string;
  metrics: ParsedMetrics;
  ads: AdData[];
  winningCount: number;
  losingCount: number;
}

export interface CampaignData {
  id: string;
  name: string;
  status: string;
  objective: string;
  metrics: ParsedMetrics;
  adSets: AdSetData[];
  winningCount: number;
  losingCount: number;
}

export interface MetaAnalyticsResponse {
  campaigns: CampaignData[];
  summary: ParsedMetrics;
  accountAverages: {
    ctr: number;
    roas: number;
    hookRate: number;
    completionRate: number;
    conversionRate: number;
    cpm: number;
  };
  lastUpdated: string;
  dateRange: { from: string; to: string };
}

// ---------------------------------------------------------------------------
// Date presets
// ---------------------------------------------------------------------------

export type DatePreset =
  | 'last_7d'
  | 'last_14d'
  | 'last_30d'
  | 'this_month'
  | 'all_time';
