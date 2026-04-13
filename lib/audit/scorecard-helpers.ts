import type {
  AuditScorecard,
  CadenceDirection,
  CompetitorProfile,
  PlatformReport,
  ProspectVideo,
  ScoreStatus,
  ScorecardItem,
} from './types';
import type { VideoAudit } from './analyze-videos';

/** Hook consistency = share of non-"none" hook_types matching the mode. */
export function aggregateHookConsistency(videos: VideoAudit[]): { percentage: number; status: ScoreStatus } {
  if (videos.length === 0) return { percentage: 0, status: 'poor' };
  const noneCount = videos.filter((v) => v.hook_type === 'none').length;
  if (noneCount / videos.length > 0.5) return { percentage: 0, status: 'poor' };
  const counts = new Map<string, number>();
  for (const v of videos) {
    if (v.hook_type === 'none') continue;
    counts.set(v.hook_type, (counts.get(v.hook_type) ?? 0) + 1);
  }
  const modeCount = Math.max(...counts.values(), 0);
  const percentage = modeCount / videos.length;
  const status: ScoreStatus = percentage >= 0.6 ? 'good' : percentage >= 0.3 ? 'warning' : 'poor';
  return { percentage, status };
}

export function aggregateContentVariety(videos: VideoAudit[]): { count: number; status: ScoreStatus } {
  const distinct = new Set(videos.map((v) => v.format)).size;
  const status: ScoreStatus = distinct >= 3 ? 'good' : distinct === 2 ? 'warning' : 'poor';
  return { count: distinct, status };
}

export function aggregateContentQuality(videos: VideoAudit[]): { avg: number; status: ScoreStatus } {
  if (videos.length === 0) return { avg: 0, status: 'poor' };
  const map: Record<VideoAudit['quality_grade'], number> = { high: 3, medium: 2, low: 1 };
  const avg = videos.reduce((s, v) => s + map[v.quality_grade], 0) / videos.length;
  const status: ScoreStatus = avg >= 2.3 ? 'good' : avg >= 1.7 ? 'warning' : 'poor';
  return { avg, status };
}

/** Cadence trend: compare avg views of newest half vs oldest half of dated videos. */
export function computeCadenceTrend(videos: ProspectVideo[]): CadenceDirection {
  const dated = videos
    .filter((v) => v.publishDate)
    .sort((a, b) => new Date(b.publishDate!).getTime() - new Date(a.publishDate!).getTime());
  if (dated.length < 4) return 'flat';
  const half = Math.floor(dated.length / 2);
  const recent = dated.slice(0, half);
  const older = dated.slice(-half);
  const avg = (vs: ProspectVideo[]) => vs.reduce((s, v) => s + v.views, 0) / vs.length;
  const recentAvg = avg(recent);
  const olderAvg = avg(older);
  if (olderAvg === 0) return 'flat';
  const delta = (recentAvg - olderAvg) / olderAvg;
  if (delta > 0.15) return 'up';
  if (delta < -0.15) return 'down';
  return 'flat';
}

export function computePlatformFocus(
  platforms: PlatformReport[],
): { focus: 'focused' | 'spread'; primary?: PlatformReport['platform'] } {
  const total = platforms.reduce((s, p) => s + p.profile.followers, 0);
  if (total === 0) return { focus: 'spread' };
  const ranked = [...platforms].sort((a, b) => b.profile.followers - a.profile.followers);
  const top = ranked[0];
  const share = top.profile.followers / total;
  if (share > 0.6) return { focus: 'focused', primary: top.platform };
  return { focus: 'spread' };
}

/**
 * Which scorecard categories each social goal most depends on.
 * Used to bias rankCompetitorGaps so the callout cards surface the gaps
 * that most directly undermine the prospect's stated goals.
 */
export const GOAL_CATEGORY_BOOSTS: Record<string, Record<string, number>> = {
  'Build brand awareness': {
    avg_views: 3,
    follower_to_view: 3,
    posting_frequency: 2,
    platform_focus_account: 2,
    content_quality: 2,
    hook_consistency: 2,
  },
  'Go viral and maximize engagement': {
    engagement_rate: 3,
    hook_consistency: 3,
    content_variety: 2,
    cadence_trend: 2,
  },
  'Drive foot traffic and local visits': {
    cta_intent_account: 3,
    bio_optimization_account: 3,
    caption_optimization: 2,
  },
  'Turn followers into paying customers': {
    cta_intent_account: 3,
    bio_optimization_account: 3,
    caption_optimization: 2,
  },
  'Create content to use for higher performance ads': {
    content_quality: 3,
    content_variety: 3,
    hook_consistency: 2,
    avg_views: 2,
  },
  'Grow a loyal community': {
    engagement_rate: 3,
    caption_optimization: 2,
    content_variety: 2,
  },
};

/**
 * Deterministic callout selection:
 * - Keep items where prospect is "poor" AND at least one competitor is "good".
 * - Rank by base weight (posting_frequency / hook_consistency / cta_intent_account = 1.5x)
 *   plus goal-specific boosts from GOAL_CATEGORY_BOOSTS.
 * - Return top 3.
 */
export function rankCompetitorGaps(
  scorecard: AuditScorecard,
  socialGoals: string[] = [],
): ScorecardItem[] {
  const BASE_WEIGHTS: Record<string, number> = {
    posting_frequency: 1.5,
    hook_consistency: 1.5,
    cta_intent_account: 1.5,
  };
  const goalBoosts: Record<string, number> = {};
  for (const goal of socialGoals) {
    const boosts = GOAL_CATEGORY_BOOSTS[goal] ?? {};
    for (const [cat, w] of Object.entries(boosts)) {
      goalBoosts[cat] = Math.max(goalBoosts[cat] ?? 0, w);
    }
  }
  const candidates = scorecard.items.filter(
    (i) => i.prospectStatus === 'poor' && i.competitors.some((c) => c.status === 'good'),
  );
  const scored = candidates.map((item) => ({
    item,
    score: (BASE_WEIGHTS[item.category] ?? 1) + (goalBoosts[item.category] ?? 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.item);
}

/**
 * Topline headline + one-sentence summary.
 * Competitor `overallScore` is read off the object (populated by scorecard LLM;
 * fall back to 0 if absent).
 */
export function buildTopline(
  scorecard: AuditScorecard,
  competitors: (CompetitorProfile & { overallScore?: number })[],
): { headline: string; summary: string } {
  const comps = competitors.map((c) => ({ username: c.username, score: c.overallScore ?? 0 }));
  const all = [{ username: 'prospect', score: scorecard.overallScore }, ...comps];
  all.sort((a, b) => b.score - a.score);
  const rank = all.findIndex((x) => x.username === 'prospect') + 1;
  const total = all.length;

  if (rank === 1) {
    const topGood = scorecard.items.find((i) => i.prospectStatus === 'good');
    return {
      headline: `You lead the category — widest gap on ${topGood?.label ?? 'overall performance'}`,
      summary: scorecard.summary,
    };
  }

  const leader = all[0];
  const gap = Math.max(0, leader.score - scorecard.overallScore);
  const gapPct = Math.round(gap);
  const topGood = scorecard.items.find((i) => i.prospectStatus === 'good');
  const topPoor = scorecard.items.find((i) => i.prospectStatus === 'poor');
  return {
    headline: `You're #${rank} of ${total} overall — losing leader by ${gapPct}%`,
    summary: `Strongest: ${topGood?.label ?? '—'}. Weakest: ${topPoor?.label ?? '—'}.`,
  };
}
