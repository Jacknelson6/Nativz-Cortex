/**
 * Tiny SVG bar-chart sparkline used on Overview subsystem tiles. Renders
 * a small inline chart (no recharts dep — one <svg>, zero runtime cost).
 * The whole point is at-a-glance trend: "are we ramping up, flat, or
 * falling off?" Data is one number per day, typically 7 days.
 *
 * Color adapts to the tile's health state so a green tile gets emerald
 * bars, an amber tile gets amber bars, a red tile gets red bars — the
 * chart reads as an extension of the health dot rather than a separate
 * signal.
 */
import type { SubsystemState } from './subsystem-state';

interface Props {
  /** Values one per day, most recent last. 7 entries is the normal size. */
  data: number[];
  /** Drives bar color so the chart matches the tile health dot. */
  state?: SubsystemState;
  /** Rendered width in px (defaults to fluid). Height is fixed at 28px. */
  width?: number;
  /** a11y hint — e.g. "Daily topic searches, last 7 days". */
  ariaLabel?: string;
}

const STATE_COLOR: Record<SubsystemState, string> = {
  healthy: 'fill-emerald-400/85',
  degraded: 'fill-amber-400/85',
  error: 'fill-red-500/80',
  unknown: 'fill-text-muted/35',
};

export function Sparkline({ data, state = 'healthy', width = 96, ariaLabel }: Props) {
  if (!data.length) return null;

  const max = Math.max(...data, 1);
  const barW = width / data.length;
  const gap = Math.max(1, Math.min(2, barW * 0.15));
  const barInnerW = Math.max(1, barW - gap);
  const height = 28;
  const colorClass = STATE_COLOR[state];

  // Summary readable by screen readers — the bars are graphical, so we
  // follow them with a visually-hidden tabular readout.
  const total = data.reduce((acc, v) => acc + v, 0);
  const srSummary = ariaLabel
    ? `${ariaLabel}: ${data.map((v, i) => `day ${i + 1} ${v}`).join(', ')}. Total ${total}.`
    : null;

  return (
    <span className="inline-flex items-center">
      <svg
        role={ariaLabel ? 'img' : 'presentation'}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block shrink-0"
      >
        {data.map((v, i) => {
          // Floor to 2px minimum so empty days still register visually.
          const h = Math.max(2, Math.round((v / max) * height));
          const x = i * barW + (barW - barInnerW) / 2;
          const y = height - h;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barInnerW}
              height={h}
              rx={0.75}
              className={colorClass}
            />
          );
        })}
      </svg>
      {srSummary && <span className="sr-only">{srSummary}</span>}
    </span>
  );
}
