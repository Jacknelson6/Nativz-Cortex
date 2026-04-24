'use client';

/**
 * ChartCard — the repeating card shape used for every chart / table on the
 * Infrastructure page. Based on the reference "Request Latency" card design:
 *
 *   [ICON] Title                                 [↓] [⤢]
 *          Subtitle
 *   ┌─ chart / table content ─────────────────────────┐
 *   └─────────────────────────────────────────────────┘
 *   ● legend item   ● legend item   ● legend item      N data points
 *
 * Actions:
 *   - `onDownload` renders a download button (CSV / file export).
 *   - Expand is built in: clicking ⤢ grows the card to a full-viewport
 *     overlay while preserving state. Click ⤢ again (or Esc) to collapse.
 *
 * Legend items + footer are optional — omit them on cards that don't need
 * a legend or a data-point counter.
 */

import { Download, Expand, Minimize2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

type Tone = 'brand' | 'action' | 'warn' | 'err' | 'neutral';

const TONE_STYLES: Record<Tone, string> = {
  brand: 'bg-accent/10 text-accent-text',
  action: 'bg-nz-purple/15 text-nz-purple-100',
  warn: 'bg-amber-500/10 text-amber-300',
  err: 'bg-red-500/10 text-red-300',
  neutral: 'bg-white/5 text-text-secondary',
};

export interface LegendItem {
  color: string;
  label: string;
  value?: string;
}

interface ChartCardProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  tone?: Tone;
  onDownload?: () => void;
  downloadLabel?: string;
  /** Hide the expand toggle (useful for tables that don't need the fullscreen treatment). */
  hideExpand?: boolean;
  legend?: LegendItem[];
  dataPointsLabel?: string;
  children: ReactNode;
  /** Extra inner padding when chart content needs more breathing room. */
  padContent?: boolean;
}

export function ChartCard({
  icon,
  title,
  subtitle,
  tone = 'neutral',
  onDownload,
  downloadLabel = 'Download',
  hideExpand = false,
  legend,
  dataPointsLabel,
  children,
  padContent = true,
}: ChartCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Esc collapses the overlay. Only active while expanded so we don't attach
  // global listeners unnecessarily.
  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  const inner = (
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={
              'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ' +
              TONE_STYLES[tone]
            }
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight text-text-primary">{title}</h3>
            {subtitle ? (
              <p className="mt-0.5 text-[12px] leading-snug text-text-muted">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onDownload ? (
            <button
              type="button"
              onClick={onDownload}
              title={downloadLabel}
              aria-label={downloadLabel}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover/60 hover:text-text-primary"
            >
              <Download size={15} />
            </button>
          ) : null}
          {!hideExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((s) => !s)}
              title={expanded ? 'Collapse' : 'Expand'}
              aria-label={expanded ? 'Collapse chart' : 'Expand chart'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover/60 hover:text-text-primary"
            >
              {expanded ? <Minimize2 size={15} /> : <Expand size={15} />}
            </button>
          ) : null}
        </div>
      </header>

      <div className={padContent ? 'mt-5' : 'mt-3'}>{children}</div>

      {(legend?.length || dataPointsLabel) && (
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-nativz-border/40 pt-3">
          {legend?.length ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-text-muted">
              {legend.map((l) => (
                <span key={l.label} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="text-text-secondary">{l.label}</span>
                  {l.value ? <span className="font-semibold text-text-primary">{l.value}</span> : null}
                </span>
              ))}
            </div>
          ) : (
            <span />
          )}
          {dataPointsLabel ? (
            <span className="text-[11px] tabular-nums text-text-muted">{dataPointsLabel}</span>
          ) : null}
        </footer>
      )}
    </>
  );

  if (expanded) {
    return (
      <>
        {/* Placeholder keeps the document height stable while the card is overlaid */}
        <section className="rounded-xl border border-nativz-border/60 bg-surface/50 p-5 opacity-60">
          <div className="flex items-center gap-3 text-[13px] text-text-muted">
            <Expand size={14} />
            Chart expanded · press Esc or the collapse button to restore.
          </div>
        </section>
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-background/85 backdrop-blur-sm p-4 md:p-8"
          role="dialog"
          aria-modal="true"
        >
          <section className="w-full max-w-6xl rounded-2xl border border-nativz-border bg-surface p-6 shadow-elevated">
            {inner}
          </section>
        </div>
      </>
    );
  }

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5">
      {inner}
    </section>
  );
}
