/**
 * Copy for narrative-only benchmark slides (Creative Benchmarks 2026 — LLM edition).
 * Grounded in CHART_SPECS + LLM_REPORT + LLM_DATA_APPENDIX; no row-level data.
 */

export const INTRO_HIGHLIGHTS: string[] = [
  '578,750 creatives and $1.29B realized spend (Meta), Sep 2025 – Jan 2026',
  '6,015 advertiser accounts after quality filters (e.g. ≥10 creatives in window)',
  'Winner = spend ≥10× account median and ≥$500; not tied to ROAS or revenue',
  'Aggregated, privacy-safe cuts — segments with fewer than 50 accounts suppressed on leaderboards',
];

export const KEY_FINDINGS_BULLETS: { title: string; detail: string }[] = [
  {
    title: 'Winning ads are rare',
    detail:
      'Only a small share of creatives clear the winner bar (~4–8% by spend tier). Low hit rates are often a statistical feature of performance ads, not proof creative is “bad.”',
  },
  {
    title: 'Scale changes frequency, not fundamentals',
    detail:
      'Larger advertisers see more winners largely because they run more tests. Smaller accounts can still win — just less often without volume.',
  },
  {
    title: 'Trends are not universal',
    detail:
      'Popular formats are not always where spend concentrates. Context (tier, vertical, timing) shifts what “works” on paper vs. in spend.',
  },
  {
    title: 'Spend concentrates on winners',
    detail:
      'Roughly ~55% of spend goes to winners, ~28% mid-range, ~17% losers at the dataset level; share on winners rises by tier (Micro ~23% → Enterprise ~64%).',
  },
  {
    title: '10× benchmark is a high bar',
    detail:
      'The 10×-vs-median rule sits near the ~92.3rd percentile of the ratio distribution — expect on the order of ~1 in 10–13 creatives as winners on average, not half.',
  },
];

export const CH001_BULLETS: string[] = [
  'Across accounts, higher average creatives launched per week is associated with more winning creatives.',
  'The PDF describes a positive relationship (scatter); point-level coordinates are not published (privacy).',
  'Interpretation: volume creates more draws from a rare-event process — it does not guarantee each ad is “better.”',
];

export const CH002_BULLETS: string[] = [
  'Spend per creative is heavily right-skewed: a small share of ads captures most spend.',
  'Exact histogram bins / tail percentiles are omitted in the public appendix to reduce re-identification risk.',
  'Dataset anchors: 578,750 creatives; $1.29B total spend — use for scale context, not account-level reconstruction.',
];

export const CH004_BULLETS: string[] = [
  'Hit rate alone cannot tell you whether an account tests deeply or runs a few lucky shots.',
  'Account A: 50 launches, 5 winners → 10% hit rate. Account B: 5 launches, 1 winner → 20% hit rate.',
  'Same story as the report: favor context (volume, spend mix) over a single hit-rate headline.',
];

export const CH004_TABLE: { account: string; launches: number; winners: number; hitRate: number }[] = [
  { account: 'Account A (illustrative)', launches: 50, winners: 5, hitRate: 10 },
  { account: 'Account B (illustrative)', launches: 5, winners: 1, hitRate: 20 },
];
