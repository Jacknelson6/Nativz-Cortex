'use client';

import type { VisionClipBreakdown } from '@/lib/moodboard/vision-clip-breakdown';

interface VisionClipBreakdownPanelProps {
  breakdown: VisionClipBreakdown;
  videoDurationSec: number;
}

const CLIP_COLORS: Record<string, string> = {
  talking_head: '#60A5FA',
  b_roll: '#34D399',
  meme_or_reaction: '#F472B6',
  text_overlay_heavy: '#FBBF24',
  screen_recording: '#A78BFA',
  product_focus: '#FB923C',
  dance_or_trend: '#38BDF8',
  montage: '#94A3B8',
  transition: '#64748B',
  other: '#6B7280',
};

function formatClipLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSecRange(start: number, end: number): string {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}

export function VisionClipBreakdownPanel({ breakdown, videoDurationSec }: VisionClipBreakdownPanelProps) {
  return (
    <div className="space-y-3 rounded-lg border border-accent/15 bg-accent-surface/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium text-accent-text uppercase tracking-wider">AI visual clip breakdown</p>
        <span className="text-[10px] text-text-muted truncate max-w-[140px]" title={breakdown.modelUsed}>
          {breakdown.modelUsed.replace(/^[^/]+\//, '')}
        </span>
      </div>
      {breakdown.overallSummary && (
        <p className="text-xs text-text-secondary leading-relaxed">{breakdown.overallSummary}</p>
      )}
      {breakdown.clips.length > 0 && (
        <>
          <p className="text-[10px] text-text-muted uppercase tracking-wider">Timeline</p>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5">
            {breakdown.clips.map((clip, i) => (
              <div
                key={i}
                className="first:rounded-l-full last:rounded-r-full min-w-[3px]"
                style={{
                  width: `${Math.max(2, ((clip.endSec - clip.startSec) / (videoDurationSec || 1)) * 100)}%`,
                  backgroundColor: CLIP_COLORS[clip.clipType] ?? CLIP_COLORS.other,
                }}
                title={`${formatClipLabel(clip.clipType)}: ${formatSecRange(clip.startSec, clip.endSec)}`}
              />
            ))}
          </div>
          <ul className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {breakdown.clips.map((clip, i) => (
              <li
                key={i}
                className="rounded-md border border-nativz-border/80 bg-surface-hover/20 px-2.5 py-2 text-xs"
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: `${CLIP_COLORS[clip.clipType] ?? CLIP_COLORS.other}33`,
                      color: CLIP_COLORS[clip.clipType] ?? CLIP_COLORS.other,
                    }}
                  >
                    {formatClipLabel(clip.clipType)}
                  </span>
                  <span className="text-[10px] text-text-muted font-mono">
                    {formatSecRange(clip.startSec, clip.endSec)}
                  </span>
                  <span className="text-[10px] text-text-muted ml-auto">
                    {Math.round((clip.confidence ?? 0.7) * 100)}% conf.
                  </span>
                </div>
                <p className="text-text-secondary leading-snug">{clip.onScreen}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      {breakdown.clips.length === 0 && !breakdown.overallSummary && (
        <p className="text-xs text-text-muted">No clip segments returned.</p>
      )}
    </div>
  );
}

/** Narrow unknown metadata to a VisionClipBreakdown shape for rendering. */
export function parseVisionClipBreakdown(raw: unknown): VisionClipBreakdown | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const clipsRaw = o.clips;
  if (!Array.isArray(clipsRaw)) return null;
  const clips = clipsRaw
    .map((c) => {
      if (!c || typeof c !== 'object') return null;
      const x = c as Record<string, unknown>;
      return {
        startSec: Number(x.startSec ?? x.start_sec),
        endSec: Number(x.endSec ?? x.end_sec),
        clipType: String(x.clipType ?? x.clip_type ?? 'other'),
        onScreen: String(x.onScreen ?? x.on_screen ?? ''),
        confidence: typeof x.confidence === 'number' ? x.confidence : 0.7,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c != null && Number.isFinite(c.startSec) && Number.isFinite(c.endSec));

  const overall =
    typeof o.overallSummary === 'string'
      ? o.overallSummary
      : typeof o.overall_summary === 'string'
        ? o.overall_summary
        : '';

  const analyzedAt =
    typeof o.analyzedAt === 'string'
      ? o.analyzedAt
      : typeof o.analyzed_at === 'string'
        ? o.analyzed_at
        : new Date().toISOString();

  const modelUsed = typeof o.modelUsed === 'string' ? o.modelUsed : typeof o.model_used === 'string' ? o.model_used : '';

  if (!overall.trim() && clips.length === 0) return null;

  return {
    overallSummary: overall,
    clips,
    analyzedAt,
    modelUsed: modelUsed || 'vision model',
  };
}
