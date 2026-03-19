// ─── Creative Benchmarks 2026 — Static Data ─────────────────────────────────
// Source: Motion Creative Benchmarks 2026
// Dataset: $1.29B in realized spend, 578,750 creatives, 6,015 advertisers
// Period: September 2025 – January 2026

// ─── Spend tiers ─────────────────────────────────────────────────────────────

export type SpendTier = 'Micro (<$10K)' | 'Small ($10K–$50K)' | 'Medium ($50K–$200K)' | 'Large ($200K–$1M)' | 'Enterprise ($1M+)';

export const SPEND_TIERS: SpendTier[] = [
  'Micro (<$10K)', 'Small ($10K–$50K)', 'Medium ($50K–$200K)', 'Large ($200K–$1M)', 'Enterprise ($1M+)',
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SpendTierRow {
  tier: SpendTier;
  avg_testing_volume_per_week: number;
  avg_hit_rate_pct: number;
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

export interface Top25ComparisonRow {
  tier: SpendTier;
  all_creative_vol: number;
  top25_creative_vol: number;
  all_winners_per_mo: number;
  top25_winners_per_mo: number;
}

export type Vertical =
  | 'Health & Wellness'
  | 'Fashion & Apparel'
  | 'Beauty & Personal Care'
  | 'Home & Lifestyle'
  | 'Technology'
  | 'Food & Nutrition'
  | 'Fitness & Sports'
  | 'Entertainment & Media'
  | 'Finance'
  | 'Education'
  | 'Travel & Hospitality'
  | 'Professional Services'
  | 'Automotive'
  | 'Parenting & Family'
  | 'Pets'
  | 'Other';

export const VERTICALS: Vertical[] = [
  'Health & Wellness', 'Fashion & Apparel', 'Beauty & Personal Care',
  'Home & Lifestyle', 'Technology', 'Food & Nutrition',
  'Fitness & Sports', 'Entertainment & Media', 'Finance',
  'Education', 'Travel & Hospitality', 'Professional Services',
  'Automotive', 'Parenting & Family', 'Pets', 'Other',
];

export interface HeatmapCell {
  vertical: Vertical;
  tier: SpendTier;
  weekly_creatives: number;
}

export interface VisualStyleRow {
  style: string;
  winners: number;
  mid_range: number;
  hit_rate_pct: number;
  pct_creative: number;
  pct_spend: number;
  spend_use_ratio: number;
}

export interface HookRow {
  hook_type: string;
  hit_rate_pct: number;
  spend_use_ratio: number;
}

export interface AssetTypeRow {
  asset_type: string;
  hit_rate_pct: number;
  spend_use_ratio: number;
}

// ─── CH-003: Spend tier — avg testing volume and hit rate ────────────────────

export const SPEND_TIER_DATA: SpendTierRow[] = [
  { tier: 'Micro (<$10K)', avg_testing_volume_per_week: 2.8, avg_hit_rate_pct: 4.0 },
  { tier: 'Small ($10K–$50K)', avg_testing_volume_per_week: 4.1, avg_hit_rate_pct: 6.4 },
  { tier: 'Medium ($50K–$200K)', avg_testing_volume_per_week: 6.6, avg_hit_rate_pct: 8.1 },
  { tier: 'Large ($200K–$1M)', avg_testing_volume_per_week: 11.2, avg_hit_rate_pct: 8.6 },
  { tier: 'Enterprise ($1M+)', avg_testing_volume_per_week: 18.8, avg_hit_rate_pct: 8.8 },
];

// ─── CH-005: Portfolio breakdown (% creatives by classification) ─────────────

export const PORTFOLIO_BREAKDOWN_DATA: PortfolioBreakdownRow[] = [
  { tier: 'Micro (<$10K)', losers_pct: 50.2, mid_range_pct: 46.0, winners_pct: 3.7 },
  { tier: 'Small ($10K–$50K)', losers_pct: 49.3, mid_range_pct: 44.6, winners_pct: 6.2 },
  { tier: 'Medium ($50K–$200K)', losers_pct: 52.6, mid_range_pct: 40.1, winners_pct: 7.3 },
  { tier: 'Large ($200K–$1M)', losers_pct: 53.9, mid_range_pct: 38.0, winners_pct: 8.1 },
  { tier: 'Enterprise ($1M+)', losers_pct: 52.2, mid_range_pct: 39.6, winners_pct: 8.2 },
];

// ─── CH-006: Spend allocation (% spend by classification) ────────────────────

export const SPEND_ALLOCATION_DATA: SpendAllocationRow[] = [
  { tier: 'Micro (<$10K)', losers_spend_pct: 31.5, mid_range_spend_pct: 45.6, winners_spend_pct: 23.0 },
  { tier: 'Small ($10K–$50K)', losers_spend_pct: 25.7, mid_range_spend_pct: 39.7, winners_spend_pct: 34.6 },
  { tier: 'Medium ($50K–$200K)', losers_spend_pct: 18.6, mid_range_spend_pct: 28.1, winners_spend_pct: 53.3 },
  { tier: 'Large ($200K–$1M)', losers_spend_pct: 17.1, mid_range_spend_pct: 26.4, winners_spend_pct: 56.5 },
  { tier: 'Enterprise ($1M+)', losers_spend_pct: 13.8, mid_range_spend_pct: 22.4, winners_spend_pct: 63.7 },
];

// ─── CH-007: Weekly testing volume heatmap (vertical × tier) ─────────────────

const HEATMAP_RAW: Record<string, number[]> = {
  'Health & Wellness': [3, 4, 11, 19, 46],
  'Fashion & Apparel': [3, 5, 12, 18, 33],
  'Beauty & Personal Care': [3, 4, 8, 15, 26],
  'Other': [2, 3, 8, 14, 14],
};

export const HEATMAP_DATA: HeatmapCell[] = Object.entries(HEATMAP_RAW).flatMap(([vertical, values]) =>
  SPEND_TIERS.map((tier, i) => ({
    vertical: vertical as Vertical,
    tier,
    weekly_creatives: values[i],
  }))
);

// ─── CH-008: Top 25% vs all accounts ─────────────────────────────────────────

export const TOP25_COMPARISON_DATA: Top25ComparisonRow[] = [
  { tier: 'Micro (<$10K)', all_creative_vol: 2.8, top25_creative_vol: 4.8, all_winners_per_mo: 0.0, top25_winners_per_mo: 0.0 },
  { tier: 'Small ($10K–$50K)', all_creative_vol: 4.1, top25_creative_vol: 8.0, all_winners_per_mo: 0.2, top25_winners_per_mo: 0.5 },
  { tier: 'Medium ($50K–$200K)', all_creative_vol: 6.6, top25_creative_vol: 15.9, all_winners_per_mo: 0.7, top25_winners_per_mo: 2.0 },
  { tier: 'Large ($200K–$1M)', all_creative_vol: 11.2, top25_creative_vol: 31.1, all_winners_per_mo: 1.7, top25_winners_per_mo: 5.9 },
  { tier: 'Enterprise ($1M+)', all_creative_vol: 18.8, top25_creative_vol: 54.6, all_winners_per_mo: 3.9, top25_winners_per_mo: 10.4 },
];

// ─── CH-009: Top visual styles (overall) ─────────────────────────────────────

export const VISUAL_STYLES_DATA: VisualStyleRow[] = [
  { style: 'Offer-First Banner', winners: 1100, mid_range: 3944, hit_rate_pct: 8.6, pct_creative: 21.9, pct_spend: 29.3, spend_use_ratio: 1.3 },
  { style: 'Demo', winners: 556, mid_range: 2855, hit_rate_pct: 8.1, pct_creative: 12.6, pct_spend: 12.9, spend_use_ratio: 1.0 },
  { style: 'Testimonial', winners: 507, mid_range: 3051, hit_rate_pct: 6.5, pct_creative: 13.3, pct_spend: 13.3, spend_use_ratio: 1.0 },
  { style: 'Unboxing', winners: 136, mid_range: 820, hit_rate_pct: 9.8, pct_creative: 2.1, pct_spend: 2.8, spend_use_ratio: 1.3 },
  { style: 'Celebrity', winners: 58, mid_range: 335, hit_rate_pct: 5.9, pct_creative: 0.8, pct_spend: 1.8, spend_use_ratio: 2.1 },
];

// ─── CH-011: Top hooks & headlines ───────────────────────────────────────────

export const HOOKS_DATA: HookRow[] = [
  { hook_type: 'Newness', hit_rate_pct: 11.0, spend_use_ratio: 1.4 },
  { hook_type: 'Sale announcement', hit_rate_pct: 10.5, spend_use_ratio: 1.8 },
  { hook_type: 'Price anchor', hit_rate_pct: 10.0, spend_use_ratio: 2.0 },
  { hook_type: 'Urgency', hit_rate_pct: 9.5, spend_use_ratio: 1.6 },
  { hook_type: 'Announcement', hit_rate_pct: 9.0, spend_use_ratio: 1.7 },
  { hook_type: 'Offer only', hit_rate_pct: 8.8, spend_use_ratio: 1.5 },
  { hook_type: 'FOMO', hit_rate_pct: 8.5, spend_use_ratio: 1.4 },
  { hook_type: 'Curiosity', hit_rate_pct: 8.0, spend_use_ratio: 1.3 },
  { hook_type: 'Confession', hit_rate_pct: 7.5, spend_use_ratio: 1.5 },
  { hook_type: 'Exclusivity', hit_rate_pct: 7.0, spend_use_ratio: 1.2 },
];

// ─── CH-012: Top asset types ─────────────────────────────────────────────────

export const ASSET_TYPES_DATA: AssetTypeRow[] = [
  { asset_type: 'Text only', hit_rate_pct: 12.0, spend_use_ratio: 1.9 },
  { asset_type: 'Product image with text', hit_rate_pct: 10.5, spend_use_ratio: 1.7 },
  { asset_type: 'UGC', hit_rate_pct: 9.8, spend_use_ratio: 1.4 },
  { asset_type: 'Lifestyle-product image', hit_rate_pct: 8.5, spend_use_ratio: 1.0 },
  { asset_type: 'High production', hit_rate_pct: 7.2, spend_use_ratio: 1.1 },
  { asset_type: 'GIF', hit_rate_pct: 6.8, spend_use_ratio: 1.0 },
  { asset_type: 'Illustration', hit_rate_pct: 6.5, spend_use_ratio: 1.5 },
  { asset_type: 'UGC mashup', hit_rate_pct: 6.0, spend_use_ratio: 1.2 },
];

// ─── Definitions ─────────────────────────────────────────────────────────────

export const DEFINITIONS = {
  winner: 'Spend ≥10× account median and ≥$500',
  mid_range: '≥28 days of spend, not winner',
  loser: 'Turned off before 28 days',
  hit_rate: '(Winner creatives ÷ Total creatives) × 100, unweighted mean',
  spend_use_ratio: "Format's share of spend ÷ share of creative usage. >1.0 = punches above weight",
  dataset: '578,750 creatives · 6,015 advertisers · $1.29B realized spend',
  period: 'September 2025 – January 2026',
} as const;
