'use client';

import type { PacingAnalysis } from '@/lib/mediapipe/types';

interface PacingTimelineProps {
  pacing: PacingAnalysis;
  videoDurationMs: number;
}

const STYLE_COLORS: Record<string, string> = {
  slow: 'bg-blue-400',
  moderate: 'bg-amber-400',
  fast: 'bg-orange-400',
  rapid: 'bg-red-400',
};

function shotColor(durationMs: number): string {
  if (durationMs < 2000) return 'bg-red-400/80';
  if (durationMs < 5000) return 'bg-amber-400/80';
  return 'bg-blue-400/80';
}

function formatMs(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

const STYLE_DESCRIPTIONS: Record<string, string> = {
  slow: 'Longer shots with a calm, deliberate feel',
  moderate: 'Balanced mix of quick and sustained shots',
  fast: 'Quick cuts that keep energy high',
  rapid: 'Very rapid cuts for maximum intensity',
};

export function PacingTimeline({ pacing, videoDurationMs }: PacingTimelineProps) {
  return (
    <div className="space-y-3">
      {/* Pacing style summary */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STYLE_COLORS[pacing.pacingStyle]} text-black`}>
          {pacing.pacingStyle}
        </span>
        <span className="text-xs text-text-muted">
          {STYLE_DESCRIPTIONS[pacing.pacingStyle] ?? ''}
        </span>
      </div>

      {/* Timeline bar */}
      <div>
        <div
          className="flex h-2.5 rounded-full overflow-hidden bg-white/5"
          aria-label={`Pacing timeline: ${pacing.totalCuts} cuts, average ${formatMs(pacing.averageShotDurationMs)} per shot`}
        >
          {pacing.shotDurations.map((dur, i) => (
            <div
              key={i}
              className={`${shotColor(dur)} first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${(dur / videoDurationMs) * 100}%`, minWidth: '2px' }}
              title={`Shot ${i + 1}: ${formatMs(dur)}`}
              aria-hidden="true"
            />
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 mt-1.5">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400/80" />
            <span className="text-[9px] text-text-muted">&lt;2s</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400/80" />
            <span className="text-[9px] text-text-muted">2-5s</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400/80" />
            <span className="text-[9px] text-text-muted">&gt;5s</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span><span className="text-text-primary font-medium">{pacing.totalCuts}</span> cuts</span>
        <span className="text-white/10">|</span>
        <span><span className="text-text-primary font-medium">{formatMs(pacing.averageShotDurationMs)}</span> avg shot</span>
        <span className="text-white/10">|</span>
        <span><span className="text-text-primary font-medium">{pacing.cutsPerMinute}</span>/min</span>
      </div>
    </div>
  );
}
