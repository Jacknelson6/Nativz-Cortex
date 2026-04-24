/**
 * Shared "infra section" primitive — the repeating card pattern used across
 * every Infrastructure tab. Header slot (circular icon tile + title + sub),
 * optional eyebrow micro-text, and a body slot. Flat by default (no resting
 * shadow, per Nativz brand guide).
 *
 * Icons use `rounded-full` (Nativz signature). Tone picks the tint color —
 * `brand` (cyan) for data-plane sections, `action` (purple) for anything
 * the user can act on, `warn` for degraded, `err` for failing.
 */

import type { ReactNode } from 'react';

type Tone = 'brand' | 'action' | 'warn' | 'err' | 'neutral';

const TONE_STYLES: Record<Tone, string> = {
  brand: 'bg-nz-cyan/10 text-nz-cyan',
  action: 'bg-accent/15 text-accent-text',
  warn: 'bg-amber-500/10 text-amber-300',
  err: 'bg-coral-500/10 text-coral-300',
  neutral: 'bg-white/5 text-text-secondary',
};

interface SectionCardProps {
  icon: ReactNode;
  title: string;
  sub?: string;
  eyebrow?: string;
  tone?: Tone;
  action?: ReactNode;
  children: ReactNode;
  padding?: 'sm' | 'md' | 'lg';
}

export function SectionCard({
  icon,
  title,
  sub,
  eyebrow,
  tone = 'brand',
  action,
  children,
  padding = 'md',
}: SectionCardProps) {
  const padClass = padding === 'sm' ? 'p-4' : padding === 'lg' ? 'p-6' : 'p-5';
  return (
    <section
      className={`rounded-xl border border-nativz-border bg-surface ${padClass}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={
              'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ' +
              TONE_STYLES[tone]
            }
          >
            {icon}
          </span>
          <div className="min-w-0">
            {eyebrow ? (
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-nz-cyan/80">
                {eyebrow}
              </div>
            ) : null}
            <h3 className="mt-0.5 text-[15px] font-semibold text-text-primary">{title}</h3>
            {sub ? (
              <p className="mt-1 text-[13px] leading-snug text-text-muted">{sub}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Two-column metric row — label on the left, value on the right. Useful for
 * dense key/value pairs inside a SectionCard.
 */
export function Metric({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'ok' | 'warn' | 'err';
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'err'
          ? 'text-coral-300'
          : 'text-text-primary';
  return (
    <div className="flex items-center justify-between gap-3 border-b border-nativz-border/40 py-2 last:border-b-0">
      <span className="text-[12px] uppercase tracking-wide text-text-muted">{label}</span>
      <span
        className={`truncate text-right text-[13px] ${toneClass} ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * `<details>` wrapper styled to match infrastructure cards. Collapsed by
 * default so long tables stay hidden until the user opens them.
 */
export function Disclosure({
  summary,
  count,
  children,
  defaultOpen,
}: {
  summary: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-nativz-border bg-surface" open={defaultOpen}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-5 py-3.5 text-[14px] hover:bg-surface-hover/40">
        <span className="flex items-center gap-2.5">
          <span className="inline-block h-2 w-2 rounded-full bg-text-muted transition-colors group-open:bg-nz-cyan" />
          <span className="font-medium text-text-primary">{summary}</span>
          {typeof count === 'number' ? (
            <span className="rounded-full bg-surface-hover/70 px-2 py-0.5 font-mono text-[11px] text-text-muted">
              {count.toLocaleString()}
            </span>
          ) : null}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-text-muted transition-colors group-open:text-nz-cyan">
          <span className="group-open:hidden">expand ▸</span>
          <span className="hidden group-open:inline">collapse ▾</span>
        </span>
      </summary>
      <div className="border-t border-nativz-border/60 px-5 py-4">{children}</div>
    </details>
  );
}
