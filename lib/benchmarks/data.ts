// ─── Creative Benchmarks 2026 — Static Data ─────────────────────────────────
// Source: $1.3B in tracked ad spend, 578,750 creatives, 6,015 advertisers
// Period: January 2025 - December 2025

// ─── Spend tiers ─────────────────────────────────────────────────────────────

export type SpendTier = 'Under $100K' | '$100K-$500K' | '$500K-$1M' | '$1M-$5M' | '$5M-$10M' | '$10M+';

export interface SpendTierRow {
  tier: SpendTier;
  advertisers: number;
  avg_creatives_tested: number | string; // string for "480+"
  hit_rate_pct: number;
}

export interface PortfolioBreakdownRow {
  tier: SpendTier;
  losers_pct: number;
  mid_range_pct: number;
  winners_pct: number;
}

export interface SpendAllocationRow {
  tier: SpendTier;
  losers_spend_pct: number;
  mid_range_spend_pct: number;
  winners_spend_pct: number;
}

export type Vertical =
  | 'eCommerce / DTC'
  | 'SaaS / Tech'
  | 'Finance / Fintech'
  | 'Health & Wellness'
  | 'Education / EdTech'
  | 'Gaming'
  | 'Media / Entertainment'
  | 'Travel / Hospitality';

export interface HeatmapCell {
  vertical: Vertical;
  tier: SpendTier;
  weekly_new_creatives: number;
}

export interface Top25ComparisonRow {
  metric: string;
  all_advertisers: string;
  top_25_pct: string;
  delta: string;
  positive_is_good: boolean;
}

export interface VisualStyleRow {
  rank: number;
  style: string;
  usage_pct: number;
  avg_roas: number;
  trend: 'rising' | 'stable' | 'declining';
}

export interface VisualStyleByVerticalRow {
  vertical: Vertical;
  rank: number;
  style: string;
  usage_pct: number;
  avg_roas: number;
}

export interface HookRow {
  rank: number;
  hook_type: string;
  usage_pct: number;
  avg_ctr: number;
  avg_hook_rate: number;
  trend: 'rising' | 'stable' | 'declining';
}

export interface AssetTypeRow {
  rank: number;
  asset_type: string;
  usage_pct: number;
  avg_roas: number;
  avg_cpa_index: number;
  best_vertical: Vertical;
}

// ─── CH-003: Spend tier testing volume and hit rate ──────────────────────────

export const SPEND_TIER_DATA: SpendTierRow[] = [
  { tier: 'Under $100K', advertisers: 2847, avg_creatives_tested: 8, hit_rate_pct: 3.2 },
  { tier: '$100K-$500K', advertisers: 1892, avg_creatives_tested: 24, hit_rate_pct: 5.1 },
  { tier: '$500K-$1M', advertisers: 643, avg_creatives_tested: 52, hit_rate_pct: 7.8 },
  { tier: '$1M-$5M', advertisers: 412, avg_creatives_tested: 115, hit_rate_pct: 11.4 },
  { tier: '$5M-$10M', advertisers: 142, avg_creatives_tested: 245, hit_rate_pct: 14.2 },
  { tier: '$10M+', advertisers: 79, avg_creatives_tested: '480+', hit_rate_pct: 16.8 },
];

// ─── CH-005: Portfolio breakdown by spend tier ──────────────────────────────

export const PORTFOLIO_BREAKDOWN_DATA: PortfolioBreakdownRow[] = [
  { tier: 'Under $100K', losers_pct: 72, mid_range_pct: 22, winners_pct: 6 },
  { tier: '$100K-$500K', losers_pct: 65, mid_range_pct: 25, winners_pct: 10 },
  { tier: '$500K-$1M', losers_pct: 58, mid_range_pct: 27, winners_pct: 15 },
  { tier: '$1M-$5M', losers_pct: 51, mid_range_pct: 28, winners_pct: 21 },
  { tier: '$5M-$10M', losers_pct: 45, mid_range_pct: 27, winners_pct: 28 },
  { tier: '$10M+', losers_pct: 38, mid_range_pct: 26, winners_pct: 36 },
];

// ─── CH-006: Spend allocation by tier ───────────────────────────────────────

export const SPEND_ALLOCATION_DATA: SpendAllocationRow[] = [
  { tier: 'Under $100K', losers_spend_pct: 45, mid_range_spend_pct: 38, winners_spend_pct: 17 },
  { tier: '$100K-$500K', losers_spend_pct: 35, mid_range_spend_pct: 37, winners_spend_pct: 28 },
  { tier: '$500K-$1M', losers_spend_pct: 28, mid_range_spend_pct: 34, winners_spend_pct: 38 },
  { tier: '$1M-$5M', losers_spend_pct: 20, mid_range_spend_pct: 30, winners_spend_pct: 50 },
  { tier: '$5M-$10M', losers_spend_pct: 15, mid_range_spend_pct: 25, winners_spend_pct: 60 },
  { tier: '$10M+', losers_spend_pct: 10, mid_range_spend_pct: 20, winners_spend_pct: 70 },
];

// ─── CH-007: Weekly testing volume heatmap ──────────────────────────────────

const VERTICALS: Vertical[] = [
  'eCommerce / DTC', 'SaaS / Tech', 'Finance / Fintech', 'Health & Wellness',
  'Education / EdTech', 'Gaming', 'Media / Entertainment', 'Travel / Hospitality',
];

const TIERS: SpendTier[] = [
  'Under $100K', '$100K-$500K', '$500K-$1M', '$1M-$5M', '$5M-$10M', '$10M+',
];

const heatmapMatrix: number[][] = [
  [6, 18, 42, 95, 200, 420],
  [4, 12, 28, 65, 140, 310],
  [3, 10, 24, 55, 120, 280],
  [5, 15, 35, 80, 170, 360],
  [3, 9, 20, 48, 105, 230],
  [8, 22, 50, 110, 240, 500],
  [5, 14, 32, 72, 155, 340],
  [4, 11, 26, 58, 125, 275],
];

export const HEATMAP_DATA: HeatmapCell[] = VERTICALS.flatMap((vertical, vi) =>
  TIERS.map((tier, ti) => ({
    vertical,
    tier,
    weekly_new_creatives: heatmapMatrix[vi][ti],
  }))
);

export { VERTICALS, TIERS };

// ─── CH-008: Top 25% vs all advertisers ─────────────────────────────────────

export const TOP25_COMPARISON_DATA: Top25ComparisonRow[] = [
  { metric: 'Avg creatives tested/month', all_advertisers: '38', top_25_pct: '145', delta: '+3.8x', positive_is_good: true },
  { metric: 'Hit rate', all_advertisers: '6.2%', top_25_pct: '14.8%', delta: '+2.4x', positive_is_good: true },
  { metric: 'Time to kill losers', all_advertisers: '14 days', top_25_pct: '4 days', delta: '-71%', positive_is_good: true },
  { metric: 'Budget on winners', all_advertisers: '32%', top_25_pct: '68%', delta: '+2.1x', positive_is_good: true },
  { metric: 'Unique visual styles tested', all_advertisers: '4.2', top_25_pct: '11.7', delta: '+2.8x', positive_is_good: true },
  { metric: 'Avg creative lifespan', all_advertisers: '21 days', top_25_pct: '12 days', delta: '-43%', positive_is_good: true },
  { metric: 'New hooks tested/month', all_advertisers: '6', top_25_pct: '22', delta: '+3.7x', positive_is_good: true },
];

// ─── CH-009: Top visual styles (overall) ────────────────────────────────────

export const VISUAL_STYLES_DATA: VisualStyleRow[] = [
  { rank: 1, style: 'UGC / creator-led', usage_pct: 34, avg_roas: 2.8, trend: 'rising' },
  { rank: 2, style: 'Product demo / showcase', usage_pct: 18, avg_roas: 2.4, trend: 'stable' },
  { rank: 3, style: 'Before / after', usage_pct: 12, avg_roas: 3.1, trend: 'rising' },
  { rank: 4, style: 'Testimonial / review', usage_pct: 10, avg_roas: 2.6, trend: 'stable' },
  { rank: 5, style: 'Lifestyle / aspirational', usage_pct: 8, avg_roas: 1.9, trend: 'declining' },
  { rank: 6, style: 'Text-heavy / educational', usage_pct: 7, avg_roas: 2.2, trend: 'rising' },
  { rank: 7, style: 'Meme / trend-jacking', usage_pct: 5, avg_roas: 2.0, trend: 'rising' },
  { rank: 8, style: 'Comparison / vs', usage_pct: 3, avg_roas: 2.7, trend: 'stable' },
  { rank: 9, style: 'Behind-the-scenes', usage_pct: 2, avg_roas: 1.8, trend: 'rising' },
  { rank: 10, style: 'Animation / motion graphics', usage_pct: 1, avg_roas: 1.5, trend: 'declining' },
];

// ─── CH-010: Visual styles by vertical ──────────────────────────────────────

export const VISUAL_STYLES_BY_VERTICAL_DATA: VisualStyleByVerticalRow[] = [
  // eCommerce / DTC
  { vertical: 'eCommerce / DTC', rank: 1, style: 'UGC / creator-led', usage_pct: 38, avg_roas: 3.2 },
  { vertical: 'eCommerce / DTC', rank: 2, style: 'Product demo / showcase', usage_pct: 22, avg_roas: 2.8 },
  { vertical: 'eCommerce / DTC', rank: 3, style: 'Before / after', usage_pct: 15, avg_roas: 3.5 },
  { vertical: 'eCommerce / DTC', rank: 4, style: 'Testimonial / review', usage_pct: 12, avg_roas: 2.9 },
  { vertical: 'eCommerce / DTC', rank: 5, style: 'Lifestyle / aspirational', usage_pct: 8, avg_roas: 2.1 },
  // SaaS / Tech
  { vertical: 'SaaS / Tech', rank: 1, style: 'Product demo / showcase', usage_pct: 30, avg_roas: 2.6 },
  { vertical: 'SaaS / Tech', rank: 2, style: 'Text-heavy / educational', usage_pct: 22, avg_roas: 2.8 },
  { vertical: 'SaaS / Tech', rank: 3, style: 'UGC / creator-led', usage_pct: 18, avg_roas: 2.2 },
  { vertical: 'SaaS / Tech', rank: 4, style: 'Comparison / vs', usage_pct: 12, avg_roas: 3.0 },
  { vertical: 'SaaS / Tech', rank: 5, style: 'Testimonial / review', usage_pct: 10, avg_roas: 2.4 },
  // Finance / Fintech
  { vertical: 'Finance / Fintech', rank: 1, style: 'Testimonial / review', usage_pct: 28, avg_roas: 2.9 },
  { vertical: 'Finance / Fintech', rank: 2, style: 'Text-heavy / educational', usage_pct: 24, avg_roas: 2.5 },
  { vertical: 'Finance / Fintech', rank: 3, style: 'UGC / creator-led', usage_pct: 20, avg_roas: 2.3 },
  { vertical: 'Finance / Fintech', rank: 4, style: 'Before / after', usage_pct: 14, avg_roas: 3.2 },
  { vertical: 'Finance / Fintech', rank: 5, style: 'Comparison / vs', usage_pct: 8, avg_roas: 2.7 },
  // Health & Wellness
  { vertical: 'Health & Wellness', rank: 1, style: 'Before / after', usage_pct: 32, avg_roas: 3.8 },
  { vertical: 'Health & Wellness', rank: 2, style: 'UGC / creator-led', usage_pct: 28, avg_roas: 3.0 },
  { vertical: 'Health & Wellness', rank: 3, style: 'Testimonial / review', usage_pct: 18, avg_roas: 2.8 },
  { vertical: 'Health & Wellness', rank: 4, style: 'Product demo / showcase', usage_pct: 12, avg_roas: 2.4 },
  { vertical: 'Health & Wellness', rank: 5, style: 'Lifestyle / aspirational', usage_pct: 6, avg_roas: 1.9 },
  // Education / EdTech
  { vertical: 'Education / EdTech', rank: 1, style: 'Text-heavy / educational', usage_pct: 35, avg_roas: 2.7 },
  { vertical: 'Education / EdTech', rank: 2, style: 'UGC / creator-led', usage_pct: 22, avg_roas: 2.4 },
  { vertical: 'Education / EdTech', rank: 3, style: 'Product demo / showcase', usage_pct: 18, avg_roas: 2.3 },
  { vertical: 'Education / EdTech', rank: 4, style: 'Testimonial / review', usage_pct: 14, avg_roas: 2.6 },
  { vertical: 'Education / EdTech', rank: 5, style: 'Before / after', usage_pct: 8, avg_roas: 2.9 },
  // Gaming
  { vertical: 'Gaming', rank: 1, style: 'UGC / creator-led', usage_pct: 40, avg_roas: 3.4 },
  { vertical: 'Gaming', rank: 2, style: 'Meme / trend-jacking', usage_pct: 20, avg_roas: 2.8 },
  { vertical: 'Gaming', rank: 3, style: 'Product demo / showcase', usage_pct: 15, avg_roas: 2.2 },
  { vertical: 'Gaming', rank: 4, style: 'Behind-the-scenes', usage_pct: 12, avg_roas: 2.0 },
  { vertical: 'Gaming', rank: 5, style: 'Animation / motion graphics', usage_pct: 8, avg_roas: 1.8 },
  // Media / Entertainment
  { vertical: 'Media / Entertainment', rank: 1, style: 'UGC / creator-led', usage_pct: 35, avg_roas: 2.9 },
  { vertical: 'Media / Entertainment', rank: 2, style: 'Behind-the-scenes', usage_pct: 20, avg_roas: 2.5 },
  { vertical: 'Media / Entertainment', rank: 3, style: 'Meme / trend-jacking', usage_pct: 15, avg_roas: 2.3 },
  { vertical: 'Media / Entertainment', rank: 4, style: 'Lifestyle / aspirational', usage_pct: 14, avg_roas: 2.0 },
  { vertical: 'Media / Entertainment', rank: 5, style: 'Product demo / showcase', usage_pct: 10, avg_roas: 2.1 },
  // Travel / Hospitality
  { vertical: 'Travel / Hospitality', rank: 1, style: 'Lifestyle / aspirational', usage_pct: 30, avg_roas: 2.8 },
  { vertical: 'Travel / Hospitality', rank: 2, style: 'UGC / creator-led', usage_pct: 25, avg_roas: 2.6 },
  { vertical: 'Travel / Hospitality', rank: 3, style: 'Before / after', usage_pct: 18, avg_roas: 3.0 },
  { vertical: 'Travel / Hospitality', rank: 4, style: 'Product demo / showcase', usage_pct: 15, avg_roas: 2.3 },
  { vertical: 'Travel / Hospitality', rank: 5, style: 'Behind-the-scenes', usage_pct: 8, avg_roas: 1.9 },
];

// ─── CH-011: Top hooks and headlines ────────────────────────────────────────

export const HOOKS_DATA: HookRow[] = [
  { rank: 1, hook_type: 'Question / curiosity gap', usage_pct: 22, avg_ctr: 2.8, avg_hook_rate: 45, trend: 'stable' },
  { rank: 2, hook_type: 'Bold claim / statistic', usage_pct: 18, avg_ctr: 3.2, avg_hook_rate: 42, trend: 'rising' },
  { rank: 3, hook_type: 'Problem / pain point', usage_pct: 16, avg_ctr: 2.6, avg_hook_rate: 48, trend: 'stable' },
  { rank: 4, hook_type: 'Social proof / "X people..."', usage_pct: 12, avg_ctr: 2.4, avg_hook_rate: 38, trend: 'declining' },
  { rank: 5, hook_type: '"You need to see this" / intrigue', usage_pct: 10, avg_ctr: 3.5, avg_hook_rate: 52, trend: 'rising' },
  { rank: 6, hook_type: 'Controversy / hot take', usage_pct: 8, avg_ctr: 3.8, avg_hook_rate: 55, trend: 'rising' },
  { rank: 7, hook_type: 'Tutorial / "How to..."', usage_pct: 7, avg_ctr: 2.1, avg_hook_rate: 35, trend: 'stable' },
  { rank: 8, hook_type: 'Unboxing / reveal', usage_pct: 4, avg_ctr: 2.9, avg_hook_rate: 50, trend: 'rising' },
  { rank: 9, hook_type: 'Story / narrative', usage_pct: 2, avg_ctr: 1.8, avg_hook_rate: 32, trend: 'declining' },
  { rank: 10, hook_type: 'Direct CTA / offer', usage_pct: 1, avg_ctr: 1.5, avg_hook_rate: 28, trend: 'declining' },
];

// ─── CH-012: Top asset types ────────────────────────────────────────────────

export const ASSET_TYPES_DATA: AssetTypeRow[] = [
  { rank: 1, asset_type: 'Short-form video (<30s)', usage_pct: 35, avg_roas: 2.9, avg_cpa_index: 0.85, best_vertical: 'Gaming' },
  { rank: 2, asset_type: 'Mid-form video (30-60s)', usage_pct: 22, avg_roas: 2.6, avg_cpa_index: 0.92, best_vertical: 'eCommerce / DTC' },
  { rank: 3, asset_type: 'Static image', usage_pct: 18, avg_roas: 2.0, avg_cpa_index: 1.10, best_vertical: 'Finance / Fintech' },
  { rank: 4, asset_type: 'Carousel / multi-image', usage_pct: 10, avg_roas: 2.3, avg_cpa_index: 0.95, best_vertical: 'eCommerce / DTC' },
  { rank: 5, asset_type: 'Long-form video (60s+)', usage_pct: 8, avg_roas: 2.1, avg_cpa_index: 1.15, best_vertical: 'Education / EdTech' },
  { rank: 6, asset_type: 'GIF / cinemagraph', usage_pct: 4, avg_roas: 1.8, avg_cpa_index: 1.05, best_vertical: 'Media / Entertainment' },
  { rank: 7, asset_type: 'Interactive / playable', usage_pct: 2, avg_roas: 3.2, avg_cpa_index: 0.78, best_vertical: 'Gaming' },
  { rank: 8, asset_type: 'Collection ad', usage_pct: 1, avg_roas: 2.4, avg_cpa_index: 0.90, best_vertical: 'eCommerce / DTC' },
];
