// ─── Benchmark section metadata ─────────────────────────────────────────────

export interface BenchmarkSection {
  id: string;
  title: string;
  description: string;
  source: string;
  chartType: 'table' | 'stacked-bar' | 'heatmap' | 'leaderboard';
}

export const BENCHMARK_SECTIONS: BenchmarkSection[] = [
  {
    id: 'CH-003',
    title: 'Testing volume and hit rate by spend tier',
    description: 'Higher spend tiers test more creatives AND achieve higher hit rates -- volume and quality compound.',
    source: 'Aggregated from $1.3B in tracked ad spend across Meta, TikTok, and Google. 6,015 advertisers, Jan-Dec 2025.',
    chartType: 'table',
  },
  {
    id: 'CH-005',
    title: 'Portfolio breakdown by spend tier',
    description: "Top spenders don't just spend more -- they build better portfolios. $10M+ advertisers have 6x the winner ratio of sub-$100K.",
    source: 'ROAS thresholds: Losers <0.5x, Mid-range 0.5-2x, Winners >2x. 7-day click, 1-day view attribution.',
    chartType: 'stacked-bar',
  },
  {
    id: 'CH-006',
    title: 'Spend allocation by tier',
    description: 'Top spenders ruthlessly cut losers. $10M+ advertisers allocate 70% of spend to proven winners vs. only 17% for sub-$100K.',
    source: 'Spend allocation measured as % of total monthly ad budget directed to each performance category.',
    chartType: 'stacked-bar',
  },
  {
    id: 'CH-007',
    title: 'Weekly testing volume by vertical',
    description: 'Gaming and eCommerce lead in testing velocity. Volume scales almost linearly with spend.',
    source: 'Weekly new creatives per advertiser, averaged across Q3-Q4 2025.',
    chartType: 'heatmap',
  },
  {
    id: 'CH-008',
    title: 'Top 25% vs all advertisers',
    description: 'The top quartile tests 3.8x more, kills losers 71% faster, and allocates 2.1x more budget to winners.',
    source: 'Top 25% defined by ROAS-weighted creative output score. All metrics averaged over trailing 90 days.',
    chartType: 'table',
  },
  {
    id: 'CH-009',
    title: 'Top visual styles',
    description: 'UGC dominates usage at 34%, but Before/After leads on ROAS at 3.1x. Style diversity correlates with performance.',
    source: 'AI-assisted visual style tagging validated by human reviewers (>90% agreement rate).',
    chartType: 'leaderboard',
  },
  {
    id: 'CH-010',
    title: 'Visual styles by vertical',
    description: 'Top-performing visual styles vary dramatically by industry. What works in Gaming fails in Finance.',
    source: 'Per-vertical top 5 styles by usage share. Each advertiser assigned to one primary vertical.',
    chartType: 'leaderboard',
  },
  {
    id: 'CH-011',
    title: 'Top hooks and headlines',
    description: 'Controversy and intrigue hooks deliver the highest CTR, but problem/pain point hooks retain viewers longest.',
    source: 'Hook rate = % of viewers who watch past first 3 seconds. CTR = click-through rate. 578,750 creatives analyzed.',
    chartType: 'leaderboard',
  },
  {
    id: 'CH-012',
    title: 'Top asset types',
    description: 'Short-form video dominates at 35% usage with a 0.85 CPA index. Interactive/playable ads deliver the highest ROAS at 3.2x.',
    source: 'CPA index: 1.0 = weighted average. Below 1.0 = cheaper acquisition. Above 1.0 = more expensive.',
    chartType: 'leaderboard',
  },
];

export const DEFAULT_SECTION_ORDER = BENCHMARK_SECTIONS.map((s) => s.id);
export const DEFAULT_VISIBLE_SECTIONS = BENCHMARK_SECTIONS.map((s) => s.id);
