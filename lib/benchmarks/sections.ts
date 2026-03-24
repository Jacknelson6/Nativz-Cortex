// ─── Benchmark section metadata — Creative Benchmarks 2026 (LLM edition) ─────
// Narrative + chart IDs align with CHART_SPECS.json / LLM_REPORT / LLM_DATA_APPENDIX.

export type BenchmarkChartType =
  | 'table'
  | 'stacked-bar'
  | 'heatmap'
  | 'leaderboard'
  | 'narrative';

export interface BenchmarkSection {
  id: string;
  title: string;
  description: string;
  source: string;
  chartType: BenchmarkChartType;
}

const SOURCE_CORE =
  'Motion Creative Benchmarks 2026 · 578,750 creatives · 6,015 advertisers · $1.29B spend · Sep 2025 – Jan 2026 · Meta only in appendix tables';

export const BENCHMARK_SECTIONS: BenchmarkSection[] = [
  {
    id: 'CB26-INTRO',
    title: 'Creative Benchmarks 2026',
    description:
      'What large-scale Meta spend shows about testing volume, rare winners, and why hit rate is easy to misread.',
    source: `${SOURCE_CORE}. Aggregated; no creative or advertiser identifiers in this deck.`,
    chartType: 'narrative',
  },
  {
    id: 'CB26-KF',
    title: 'Key findings at a glance',
    description:
      'Five themes from the report: rarity of winners, scale vs. fundamentals, context, spend concentration, and the 10× bar.',
    source: 'Summarized from LLM_REPORT key findings; see SOURCE_MAP.md KF-001–KF-005.',
    chartType: 'narrative',
  },
  {
    id: 'CH-001',
    title: 'Weekly volume and winning creatives',
    description:
      'Advertisers that launch more creatives per week tend to accumulate more winners — more tickets in a rare-event lottery.',
    source: `${SOURCE_CORE}. CH-001: narrative / conceptual only; no account-level scatter released.`,
    chartType: 'narrative',
  },
  {
    id: 'CH-002',
    title: 'Spend concentration per creative',
    description:
      'A small fraction of ads receives most spend; the distribution is long-tailed. Exact public bins are withheld for privacy.',
    source: `${SOURCE_CORE}. CH-002: qualitative distribution; see appendix.`,
    chartType: 'narrative',
  },
  {
    id: 'CH-003',
    title: 'Testing volume and hit rate by spend tier',
    description:
      'Higher monthly spend tiers average more creatives per week and slightly higher hit rates — scale buys more draws.',
    source: `${SOURCE_CORE}. Winner = ≥10× account median & ≥$500; hit rate = unweighted mean of account hit rates.`,
    chartType: 'table',
  },
  {
    id: 'CH-004',
    title: 'Why hit rate misleads (hypothetical)',
    description:
      'Two accounts can show very different hit rates for opposite reasons — always pair hit rate with volume and spend mix.',
    source: 'Illustrative table only (Account A / B). Not real advertisers.',
    chartType: 'narrative',
  },
  {
    id: 'CH-005',
    title: 'Portfolio mix: losers, mid-range, winners',
    description:
      'By creative count: roughly half “losers” (under 28 days), ~38–46% mid-range, ~4–8% winners — winners remain a sliver.',
    source: `${SOURCE_CORE}. Loser / mid-range / winner per report definitions.`,
    chartType: 'stacked-bar',
  },
  {
    id: 'CH-006',
    title: 'Where spend goes by tier',
    description:
      'Spend shifts toward winners as tiers grow (e.g. Micro ~23% on winners → Enterprise ~64%). Losers capture a shrinking share of budget.',
    source: `${SOURCE_CORE}. CH-006: Large tier row reconciled for monotone winner % (see SOURCE_MAP open question).`,
    chartType: 'stacked-bar',
  },
  {
    id: 'CH-007',
    title: 'Weekly testing volume by vertical × tier',
    description:
      'Heatmap cells are median/mean creatives per week. Verticals with under 50 accounts roll into Other.',
    source: `${SOURCE_CORE}. MIN_ACCOUNTS_FOR_BRAND_CATEGORY = 50.`,
    chartType: 'heatmap',
  },
  {
    id: 'CH-008',
    title: 'Top quartile vs all accounts',
    description:
      'Within each tier, the top 25% by winner count run far more volume and more winners per month than the tier average.',
    source: `${SOURCE_CORE}. Top 25% = winner-count ≥ 75th percentile within tier.`,
    chartType: 'table',
  },
  {
    id: 'CH-009',
    title: 'Top visual styles (overall)',
    description:
      'Hit rate and spend-use ratio (share of spend ÷ share of creatives). Formats with under 50 accounts excluded.',
    source: `${SOURCE_CORE}. MIN_ACCOUNTS_FOR_FORMAT = 50.`,
    chartType: 'leaderboard',
  },
  {
    id: 'CH-010',
    title: 'Visual styles by vertical',
    description:
      'Leaderboards differ by industry — “best” format is not universal. Sample verticals called out in the appendix.',
    source: `${SOURCE_CORE}. Same suppression rules as CH-009 where applicable.`,
    chartType: 'leaderboard',
  },
  {
    id: 'CH-011',
    title: 'Hooks & headlines',
    description:
      'Coalesced hook + headline tactics; hit rate vs spend-use ratio. Sparse segments dropped below 50 accounts.',
    source: `${SOURCE_CORE}. MIN_ACCOUNTS_FOR_FORMAT = 50.`,
    chartType: 'leaderboard',
  },
  {
    id: 'CH-012',
    title: 'Asset types',
    description:
      'UGC, text-first, product stills, etc. — which asset families over- or under-index on spend vs usage.',
    source: `${SOURCE_CORE}. MIN_ACCOUNTS_FOR_FORMAT = 50.`,
    chartType: 'leaderboard',
  },
];

export const DEFAULT_SECTION_ORDER = BENCHMARK_SECTIONS.map((s) => s.id);
export const DEFAULT_VISIBLE_SECTIONS = BENCHMARK_SECTIONS.map((s) => s.id);

const NARRATIVE_HEAD = ['CB26-INTRO', 'CB26-KF', 'CH-001', 'CH-002'] as const;

/**
 * Ensures newer sections exist in `section_order` for decks created before narrative slides.
 * Does not change `visible_sections` — new IDs stay off until toggled in the editor.
 */
export function mergeBenchmarkSectionOrder(order: string[]): string[] {
  let next = [...order];
  for (const id of [...NARRATIVE_HEAD].reverse()) {
    if (!next.includes(id)) next.unshift(id);
  }
  if (!next.includes('CH-004')) {
    const i3 = next.indexOf('CH-003');
    if (i3 !== -1) next.splice(i3 + 1, 0, 'CH-004');
    else next.splice(NARRATIVE_HEAD.length, 0, 'CH-004');
  }
  for (const id of DEFAULT_SECTION_ORDER) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}
