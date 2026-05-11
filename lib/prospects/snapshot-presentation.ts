// SPY-09 T04: pure function that builds a PresentationSnapshot from the
// pieces persisted across SPY-01/03/04/05 + SPY-09's 30-day plan. Used by
// both the in-memory admin present page and the mint-link snapshot stored
// in prospect_share_links.metadata.

import type { ScorecardSnapshot, ScorecardSummary } from './checklist';
import type {
  PresentationSnapshot,
  PresentationVsCompetitors,
  ProspectAnalysisRow,
  ProspectCompetitorBenchmarkRow,
  ProspectRow,
  ThirtyDayPlan,
} from './types';

/**
 * Map a ScorecardSummary into a single 0..100 score:
 *   green = 100, yellow = 60, red = 0, na = excluded from denominator.
 * Keeps the maths inside this PRD so we don't have to reshape downstream
 * if the rule ever changes.
 */
export function scoreFromSummary(summary: ScorecardSummary): number {
  const denom = summary.green + summary.yellow + summary.red;
  if (denom === 0) return 0;
  const points = summary.green * 100 + summary.yellow * 60;
  return Math.round(points / denom);
}

export function scoreFromScorecard(scorecard: ScorecardSnapshot | null): number {
  if (!scorecard) return 0;
  return scoreFromSummary(scorecard.summary);
}

interface BuildInput {
  prospect: Pick<ProspectRow, 'brand_name'>;
  brandLogoUrl: string | null;
  analysis: ProspectAnalysisRow;
  scorecard: ScorecardSnapshot;
  benchmark: ProspectCompetitorBenchmarkRow | null;
  plan: ThirtyDayPlan;
  contact: { sales_rep_name: string; sales_rep_email: string };
  preparedForDate?: string; // ISO date; defaults to now
}

function buildVsCompetitors(
  scorecard: ScorecardSnapshot,
  benchmark: ProspectCompetitorBenchmarkRow | null,
): PresentationVsCompetitors | null {
  if (!benchmark) return null;
  const competitorScores = benchmark.competitors
    .filter((c) => c.status !== 'failed' && c.scorecard)
    .map((c) => ({
      handle: c.handle,
      score: scoreFromScorecard(c.scorecard),
    }));
  if (competitorScores.length === 0) return null;
  return {
    prospectScore: scoreFromScorecard(scorecard),
    competitorScores,
  };
}

function buildBiggestOpportunity(
  analysis: ProspectAnalysisRow,
  scorecard: ScorecardSnapshot,
): { title: string; body: string } {
  // Prefer the LLM-generated `biggest_opportunity` from the rollup pass.
  // Fall back to the worst-scoring checklist item so the panel never goes
  // empty on partial analyses.
  if (analysis.biggest_opportunity && analysis.biggest_opportunity.trim().length > 0) {
    return {
      title: 'Biggest opportunity',
      body: analysis.biggest_opportunity.trim(),
    };
  }
  const worst = scorecard.items.find((i) => i.score === 'red')
    ?? scorecard.items.find((i) => i.score === 'yellow')
    ?? null;
  if (!worst) {
    return {
      title: 'Solid foundation',
      body: 'No red flags. The plan focuses on volume, not fundamentals.',
    };
  }
  return {
    title: worst.title,
    body: worst.note,
  };
}

export function buildPresentationSnapshot(input: BuildInput): PresentationSnapshot {
  const preparedFor = input.preparedForDate ?? new Date().toISOString();
  return {
    cover: {
      brand_name: input.prospect.brand_name,
      brand_logo_url: input.brandLogoUrl,
      prepared_for_date: preparedFor,
    },
    current_state: input.scorecard,
    vs_competitors: buildVsCompetitors(input.scorecard, input.benchmark),
    biggest_opportunity: buildBiggestOpportunity(input.analysis, input.scorecard),
    thirty_day_plan: input.plan,
    contact: input.contact,
  };
}
