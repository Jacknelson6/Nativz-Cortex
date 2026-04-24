export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-nativz-border bg-surface px-4 py-4 transition-all duration-200 hover:-translate-y-px hover:border-nativz-border/90 hover:bg-surface-hover/30">
      <span aria-hidden className="absolute left-3 top-3 h-1 w-1 rounded-full bg-accent/60" />
      <div className="pl-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/85">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold leading-none tabular-nums text-text-primary">
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'completed' || status === 'ok' || status === 'healthy'
      ? 'border border-accent/30 bg-accent/10 text-accent-text'
      : status === 'failed' || status === 'error'
        ? 'border border-coral-500/30 bg-coral-500/10 text-coral-300'
        : status === 'partial' || status === 'degraded'
          ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
          : status === 'processing' || status === 'pending'
            ? 'border border-text-muted/30 bg-surface-hover/60 text-text-secondary'
            : 'border border-text-muted/20 bg-surface-hover/40 text-text-muted';
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {status}
    </span>
  );
}

export function HealthDot({
  state,
  label,
}: {
  state: 'healthy' | 'degraded' | 'error' | 'unknown';
  label?: string;
}) {
  const tone =
    state === 'healthy'
      ? 'bg-accent shadow-[0_0_0_3px_rgba(0,174,239,0.18)]'
      : state === 'degraded'
        ? 'bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]'
        : state === 'error'
          ? 'bg-coral-400 shadow-[0_0_0_3px_rgba(252,113,113,0.18)]'
          : 'bg-text-muted/40';
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block h-2 w-2 rounded-full ${tone}`} />
      {label && <span className="text-xs text-text-muted">{label}</span>}
    </span>
  );
}

export function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-0.5 text-xs text-text-primary ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
