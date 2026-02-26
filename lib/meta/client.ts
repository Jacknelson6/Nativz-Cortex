/**
 * Meta Marketing API client for Ads Manager data.
 *
 * Required env vars:
 * - META_APP_ACCESS_TOKEN  (long-lived system user token)
 * - META_AD_ACCOUNT_ID     (e.g. act_XXXXXXXXXX)
 */

import type {
  MetaCampaignRaw,
  MetaAdSetRaw,
  MetaAdRaw,
  MetaAdInsights,
  ParsedMetrics,
  AdData,
  AdSetData,
  CampaignData,
  MetaAnalyticsResponse,
  DatePreset,
} from './types';

const META_API_VERSION = 'v18.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ---------------------------------------------------------------------------
// Performance score weights (easy to tune)
// ---------------------------------------------------------------------------

export const SCORE_WEIGHTS = {
  ctr: 0.20,
  roas: 0.25,
  hookRate: 0.20,
  completionRate: 0.15,
  cpm: 0.10,        // inverse — lower is better
  conversionRate: 0.10,
} as const;

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getToken(): string {
  const token = process.env.META_APP_ACCESS_TOKEN;
  if (!token) throw new Error('META_APP_ACCESS_TOKEN not set');
  return token;
}

function getAdAccountId(): string {
  const id = process.env.META_AD_ACCOUNT_ID;
  if (!id) throw new Error('META_AD_ACCOUNT_ID not set');
  return id;
}

export function isMetaConfigured(): boolean {
  return !!(process.env.META_APP_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

export function getDateRange(preset: DatePreset | string, customFrom?: string, customTo?: string): { since: string; until: string } {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  switch (preset) {
    case 'last_7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { since: d.toISOString().split('T')[0], until: today };
    }
    case 'last_14d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 14);
      return { since: d.toISOString().split('T')[0], until: today };
    }
    case 'last_30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { since: d.toISOString().split('T')[0], until: today };
    }
    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: first.toISOString().split('T')[0], until: today };
    }
    case 'all_time': {
      return { since: '2020-01-01', until: today };
    }
    case 'custom': {
      return { since: customFrom || today, until: customTo || today };
    }
    default:
      return { since: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0], until: today };
  }
}

// ---------------------------------------------------------------------------
// Generic fetch helper
// ---------------------------------------------------------------------------

async function metaGet<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const token = getToken();
  const url = new URL(`${META_API_BASE}/${endpoint}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { next: { revalidate: 900 } }); // 15 min cache
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status}: ${body}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Parse insights into our metrics format
// ---------------------------------------------------------------------------

function parseMetrics(insights: MetaAdInsights | undefined): ParsedMetrics {
  if (!insights) return emptyMetrics();

  const spend = parseFloat(insights.spend || '0');
  const impressions = parseInt(insights.impressions || '0', 10);
  const reach = parseInt(insights.reach || '0', 10);
  const clicks = parseInt(insights.clicks || '0', 10);

  // Video metrics
  const videoP25 = getActionValue(insights.video_p25_watched_actions);
  const videoP50 = getActionValue(insights.video_p50_watched_actions);
  const videoP100 = getActionValue(insights.video_p100_watched_actions);

  // ROAS — purchase value / spend
  const purchaseValue = insights.action_values?.find(
    (a) => a.action_type === 'offsite_conversion.fb_pixel_purchase' || a.action_type === 'purchase',
  );
  const roas = spend > 0 && purchaseValue ? parseFloat(purchaseValue.value) / spend : 0;

  // Conversions
  const conversions = insights.actions?.filter(
    (a) => a.action_type === 'offsite_conversion.fb_pixel_purchase' || a.action_type === 'purchase',
  ).reduce((sum, a) => sum + parseFloat(a.value), 0) ?? 0;

  // Cost per like
  const likeAction = insights.cost_per_action_type?.find((a) => a.action_type === 'like');
  const costPerLike = likeAction ? parseFloat(likeAction.value) : 0;

  // Cost per profile visit
  const visitAction = insights.cost_per_action_type?.find(
    (a) => a.action_type === 'post_engagement' || a.action_type === 'onsite_conversion.post_save',
  );
  const costPerProfileVisit = visitAction ? parseFloat(visitAction.value) : 0;

  return {
    spend,
    impressions,
    reach,
    clicks,
    ctr: parseFloat(insights.ctr || '0'),
    cpm: parseFloat(insights.cpm || '0'),
    cpc: parseFloat(insights.cpc || '0'),
    frequency: parseFloat(insights.frequency || '0'),
    hookRate: impressions > 0 ? (videoP25 / impressions) * 100 : 0,
    holdRate: impressions > 0 ? (videoP50 / impressions) * 100 : 0,
    completionRate: impressions > 0 ? (videoP100 / impressions) * 100 : 0,
    roas,
    conversions,
    costPerLike,
    costPerProfileVisit,
  };
}

function getActionValue(actions?: { action_type: string; value: string }[]): number {
  if (!actions || actions.length === 0) return 0;
  // Sum all action values (usually there's one entry for "video_view")
  return actions.reduce((sum, a) => sum + parseFloat(a.value || '0'), 0);
}

function emptyMetrics(): ParsedMetrics {
  return {
    spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: 0, cpm: 0, cpc: 0,
    frequency: 0, hookRate: 0, holdRate: 0, completionRate: 0, roas: 0,
    conversions: 0, costPerLike: 0, costPerProfileVisit: 0,
  };
}

function sumMetrics(metricsList: ParsedMetrics[]): ParsedMetrics {
  const totals = emptyMetrics();
  for (const m of metricsList) {
    totals.spend += m.spend;
    totals.impressions += m.impressions;
    totals.reach += m.reach;
    totals.clicks += m.clicks;
    totals.conversions += m.conversions;
  }
  // Recalculate rates from totals
  if (totals.impressions > 0) {
    totals.ctr = (totals.clicks / totals.impressions) * 100;
    totals.cpm = (totals.spend / totals.impressions) * 1000;
  }
  if (totals.clicks > 0) {
    totals.cpc = totals.spend / totals.clicks;
  }
  if (totals.spend > 0) {
    // Sum ROAS weighted by spend
    const totalPurchaseValue = metricsList.reduce((s, m) => s + m.roas * m.spend, 0);
    totals.roas = totalPurchaseValue / totals.spend;
  }
  // Average video rates across ads that have them
  const withVideo = metricsList.filter((m) => m.hookRate > 0);
  if (withVideo.length > 0) {
    totals.hookRate = withVideo.reduce((s, m) => s + m.hookRate, 0) / withVideo.length;
    totals.holdRate = withVideo.reduce((s, m) => s + m.holdRate, 0) / withVideo.length;
    totals.completionRate = withVideo.reduce((s, m) => s + m.completionRate, 0) / withVideo.length;
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Performance scoring
// ---------------------------------------------------------------------------

function computePerformanceScore(
  metrics: ParsedMetrics,
  averages: { ctr: number; roas: number; hookRate: number; completionRate: number; conversionRate: number; cpm: number },
): number {
  const normalize = (value: number, avg: number) => (avg > 0 ? (value / avg) * 50 : 50);
  const inverseCpm = (value: number, avg: number) => (avg > 0 && value > 0 ? (avg / value) * 50 : 50);

  const convRate = metrics.impressions > 0 ? (metrics.conversions / metrics.impressions) * 100 : 0;

  const score =
    normalize(metrics.ctr, averages.ctr) * SCORE_WEIGHTS.ctr +
    normalize(metrics.roas, averages.roas) * SCORE_WEIGHTS.roas +
    normalize(metrics.hookRate, averages.hookRate) * SCORE_WEIGHTS.hookRate +
    normalize(metrics.completionRate, averages.completionRate) * SCORE_WEIGHTS.completionRate +
    inverseCpm(metrics.cpm, averages.cpm) * SCORE_WEIGHTS.cpm +
    normalize(convRate, averages.conversionRate) * SCORE_WEIGHTS.conversionRate;

  return Math.max(0, Math.min(100, score));
}

function getPerformanceLabel(score: number): 'winning' | 'losing' | 'neutral' {
  if (score >= 60) return 'winning';
  if (score <= 40) return 'losing';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Fetch ads data from Meta Marketing API
// ---------------------------------------------------------------------------

const INSIGHTS_FIELDS = [
  'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpm', 'cpc', 'cpp',
  'frequency', 'unique_clicks', 'actions', 'action_values',
  'cost_per_action_type', 'video_avg_time_watched_actions',
  'video_p25_watched_actions', 'video_p50_watched_actions',
  'video_p75_watched_actions', 'video_p100_watched_actions',
].join(',');

export async function fetchMetaAdsData(
  datePreset: DatePreset | 'custom',
  customFrom?: string,
  customTo?: string,
): Promise<MetaAnalyticsResponse> {
  const accountId = getAdAccountId();
  const { since, until } = getDateRange(datePreset, customFrom, customTo);
  const timeRange = JSON.stringify({ since, until });

  // Fetch campaigns, ad sets, and ads in parallel
  const [campaignsRes, adSetsRes, adsRes] = await Promise.all([
    metaGet<{ data: MetaCampaignRaw[] }>(`${accountId}/campaigns`, {
      fields: `id,name,status,objective,insights.fields(${INSIGHTS_FIELDS}).time_range(${timeRange})`,
      limit: '100',
    }),
    metaGet<{ data: MetaAdSetRaw[] }>(`${accountId}/adsets`, {
      fields: `id,name,status,campaign_id,optimization_goal,daily_budget,lifetime_budget,insights.fields(${INSIGHTS_FIELDS}).time_range(${timeRange})`,
      limit: '200',
    }),
    metaGet<{ data: MetaAdRaw[] }>(`${accountId}/ads`, {
      fields: `id,name,status,adset_id,creative{thumbnail_url,title,body},insights.fields(${INSIGHTS_FIELDS}).time_range(${timeRange})`,
      limit: '500',
    }),
  ]);

  // Parse all ad metrics first to compute account averages
  const allAdMetrics = adsRes.data.map((ad) => parseMetrics(ad.insights?.data?.[0]));
  const activeAdMetrics = allAdMetrics.filter((m) => m.impressions > 0);

  const accountAverages = {
    ctr: avg(activeAdMetrics.map((m) => m.ctr)),
    roas: avg(activeAdMetrics.map((m) => m.roas)),
    hookRate: avg(activeAdMetrics.filter((m) => m.hookRate > 0).map((m) => m.hookRate)),
    completionRate: avg(activeAdMetrics.filter((m) => m.completionRate > 0).map((m) => m.completionRate)),
    conversionRate: avg(activeAdMetrics.map((m) => m.impressions > 0 ? (m.conversions / m.impressions) * 100 : 0)),
    cpm: avg(activeAdMetrics.map((m) => m.cpm)),
  };

  // Build ad map keyed by adset_id
  const adsByAdSet = new Map<string, AdData[]>();
  for (let i = 0; i < adsRes.data.length; i++) {
    const raw = adsRes.data[i];
    const metrics = allAdMetrics[i];
    const score = computePerformanceScore(metrics, accountAverages);
    const ad: AdData = {
      id: raw.id,
      name: raw.name,
      status: raw.status,
      thumbnailUrl: raw.creative?.thumbnail_url ?? null,
      creativeTitle: raw.creative?.title ?? null,
      creativeBody: raw.creative?.body ?? null,
      metrics,
      performanceScore: Math.round(score),
      performanceLabel: getPerformanceLabel(score),
    };

    // Extract adset_id from the raw response — it's in the nested fields
    const adsetId = (raw as unknown as Record<string, string>).adset_id ?? '';
    const existing = adsByAdSet.get(adsetId) ?? [];
    existing.push(ad);
    adsByAdSet.set(adsetId, existing);
  }

  // Build ad set map keyed by campaign_id
  const adSetsByCampaign = new Map<string, AdSetData[]>();
  for (const raw of adSetsRes.data) {
    const ads = adsByAdSet.get(raw.id) ?? [];
    ads.sort((a, b) => b.performanceScore - a.performanceScore);
    const metrics = ads.length > 0 ? sumMetrics(ads.map((a) => a.metrics)) : parseMetrics(raw.insights?.data?.[0]);

    const adSet: AdSetData = {
      id: raw.id,
      name: raw.name,
      status: raw.status,
      metrics,
      ads,
      winningCount: ads.filter((a) => a.performanceLabel === 'winning').length,
      losingCount: ads.filter((a) => a.performanceLabel === 'losing').length,
    };

    const campaignId = (raw as unknown as Record<string, string>).campaign_id ?? '';
    const existing = adSetsByCampaign.get(campaignId) ?? [];
    existing.push(adSet);
    adSetsByCampaign.set(campaignId, existing);
  }

  // Build campaigns
  const campaigns: CampaignData[] = campaignsRes.data.map((raw) => {
    const adSets = adSetsByCampaign.get(raw.id) ?? [];
    adSets.sort((a, b) => b.metrics.roas - a.metrics.roas);
    const allAds = adSets.flatMap((s) => s.ads);
    const metrics = allAds.length > 0 ? sumMetrics(allAds.map((a) => a.metrics)) : parseMetrics(raw.insights?.data?.[0]);

    return {
      id: raw.id,
      name: raw.name,
      status: raw.status,
      objective: raw.objective ?? '',
      metrics,
      adSets,
      winningCount: allAds.filter((a) => a.performanceLabel === 'winning').length,
      losingCount: allAds.filter((a) => a.performanceLabel === 'losing').length,
    };
  });

  // Sort campaigns by spend descending
  campaigns.sort((a, b) => b.metrics.spend - a.metrics.spend);

  // Summary = sum of all campaign metrics
  const summary = sumMetrics(campaigns.map((c) => c.metrics));

  return {
    campaigns,
    summary,
    accountAverages,
    lastUpdated: new Date().toISOString(),
    dateRange: { from: since, to: until },
  };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
