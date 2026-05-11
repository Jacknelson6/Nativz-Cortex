// SPY-06 T06-T10: deterministic delta rules.
//
// Each rule is a pure function of (prior snapshot, current snapshot) →
// alert | null. Severity thresholds live in this file as env-overridable
// constants. NO LLM here — the entire point is reproducibility.
//
// Foundation note: PRD asked for 5 files under lib/prospects/delta-rules/.
// Consolidated here. If/when a rule grows non-trivial logic, pull only
// that rule into its own module.

import type {
  AlertKind,
  AlertSeverity,
  MonitorSnapshotMetrics,
  ProspectMonitorSnapshotRow,
} from './types';

export interface DraftAlert {
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  evidence: Record<string, unknown>;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const FOLLOWER_JUMP_PCT_MIN = envInt('PROSPECT_MONITOR_FOLLOWER_JUMP_PCT', 10);
const FOLLOWER_JUMP_ABS_MIN = envInt('PROSPECT_MONITOR_FOLLOWER_JUMP_ABS', 500);
const VIRAL_MULT = envInt('PROSPECT_MONITOR_VIRAL_MULT', 5);

// ── Rules ───────────────────────────────────────────────────────────────────

function ruleFollowerJump(
  prev: MonitorSnapshotMetrics,
  curr: MonitorSnapshotMetrics,
  handle: string,
): DraftAlert | null {
  const a = prev.followers_count ?? 0;
  const b = curr.followers_count ?? 0;
  if (a <= 0 || b <= a) return null;
  const delta = b - a;
  if (delta < FOLLOWER_JUMP_ABS_MIN) return null;
  const pct = (delta / a) * 100;
  if (pct < FOLLOWER_JUMP_PCT_MIN) return null;
  const severity: AlertSeverity = pct >= 25 ? 'high' : pct >= 10 ? 'medium' : 'low';
  return {
    kind: 'follower_jump',
    severity,
    message: `@${handle} gained ${delta.toLocaleString()} followers (+${pct.toFixed(1)}%) week-over-week.`,
    evidence: { prev_followers: a, curr_followers: b, delta, pct: Number(pct.toFixed(2)) },
  };
}

function ruleViralPost(
  _prev: MonitorSnapshotMetrics,
  curr: MonitorSnapshotMetrics,
  handle: string,
): DraftAlert | null {
  const top = curr.top_post;
  const median = curr.median_views_last_10;
  if (!top || top.views == null || !median || median <= 0) return null;
  const mult = top.views / median;
  if (mult < 3) return null;
  const severity: AlertSeverity = mult >= 10 ? 'high' : mult >= VIRAL_MULT ? 'medium' : 'low';
  return {
    kind: 'viral_post',
    severity,
    message: `@${handle} posted a viral hit (${top.views.toLocaleString()} views, ${mult.toFixed(1)}× median).`,
    evidence: { top_post_id: top.id, views: top.views, median, multiplier: Number(mult.toFixed(2)) },
  };
}

function ruleCadenceShift(
  prev: MonitorSnapshotMetrics,
  curr: MonitorSnapshotMetrics,
  handle: string,
): DraftAlert | null {
  const a = prev.posts_last_7d ?? 0;
  const b = curr.posts_last_7d ?? 0;
  if (a === 0 && b >= 5) {
    return {
      kind: 'cadence_shift',
      severity: 'high',
      message: `@${handle} went from silent to ${b} posts in the past week.`,
      evidence: { prev_posts_per_week: a, curr_posts_per_week: b },
    };
  }
  if (a === 0 || a === b) return null;
  const pct = Math.abs(b - a) / a;
  if (pct < 0.5) return null;
  return {
    kind: 'cadence_shift',
    severity: 'medium',
    message: `@${handle} posting cadence shifted from ${a}/wk to ${b}/wk.`,
    evidence: { prev_posts_per_week: a, curr_posts_per_week: b, pct: Number((pct * 100).toFixed(1)) },
  };
}

function ruleFormatPivot(
  prev: MonitorSnapshotMetrics,
  curr: MonitorSnapshotMetrics,
  handle: string,
): DraftAlert | null {
  const prevSet = new Set((prev.archetypes_last_5 ?? []).filter(Boolean) as string[]);
  const currList = (curr.archetypes_last_5 ?? []).filter(Boolean) as string[];
  if (prevSet.size === 0 || currList.length < 5) return null;
  const novel = currList.filter((a) => !prevSet.has(a));
  if (novel.length < 3) return null;
  return {
    kind: 'format_pivot',
    severity: 'medium',
    message: `@${handle} pivoted formats — ${novel.length}/5 recent posts are new archetypes.`,
    evidence: { novel_archetypes: novel, prior_archetypes: Array.from(prevSet) },
  };
}

// ── Aggregate ───────────────────────────────────────────────────────────────

export function runDeltaRules(
  prev: ProspectMonitorSnapshotRow | null,
  curr: ProspectMonitorSnapshotRow,
): DraftAlert[] {
  if (!prev) return []; // first run, nothing to compare
  const handle = curr.competitor_handle;
  const drafts: Array<DraftAlert | null> = [
    ruleFollowerJump(prev.raw_metrics, curr.raw_metrics, handle),
    ruleViralPost(prev.raw_metrics, curr.raw_metrics, handle),
    ruleCadenceShift(prev.raw_metrics, curr.raw_metrics, handle),
    ruleFormatPivot(prev.raw_metrics, curr.raw_metrics, handle),
  ];
  return drafts.filter((d): d is DraftAlert => d !== null);
}

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  follower_jump: 'Follower jump',
  viral_post: 'Viral post',
  cadence_shift: 'Cadence shift',
  format_pivot: 'Format pivot',
};
