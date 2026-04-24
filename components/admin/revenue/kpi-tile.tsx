import type { ReactNode } from 'react';

export function KpiTile({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'brand' | 'warn' | 'err' | 'good';
  icon?: ReactNode;
}) {
  const accent =
    tone === 'brand'
      ? 'text-nz-cyan'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'err'
          ? 'text-coral-300'
          : tone === 'good'
            ? 'text-emerald-300'
            : 'text-text-primary';

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
          {label}
        </span>
        {icon ? <span className="text-text-muted">{icon}</span> : null}
      </div>
      <div className={`mt-2 text-2xl font-semibold leading-tight ${accent}`}>{value}</div>
      {sub ? <p className="mt-1 text-[11px] text-text-muted">{sub}</p> : null}
    </div>
  );
}
