export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-nativz-border bg-surface px-5 py-4 transition-all duration-200 hover:-translate-y-px hover:border-nativz-border/90 hover:bg-surface-hover/30">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted/85">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold leading-none tabular-nums text-text-primary">
        {value}
      </div>
      {sub && <div className="mt-2 text-[12px] text-text-muted">{sub}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const ok = s === 'completed' || s === 'ok' || s === 'healthy' || s === 'ready' || s === 'succeeded' || s === 'success';
  const bad = s === 'failed' || s === 'error' || s === 'canceled' || s === 'cancelled';
  const warn = s === 'partial' || s === 'degraded' || s === 'building' || s === 'queued' || s === 'initializing';
  const tone = ok
    ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : bad
      ? 'border border-red-500/30 bg-red-500/10 text-red-300'
      : warn
        ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
        : s === 'processing' || s === 'pending' || s === 'running'
          ? 'border border-text-muted/30 bg-surface-hover/60 text-text-secondary'
          : 'border border-text-muted/20 bg-surface-hover/40 text-text-muted';
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tone}`}>
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
  // Traffic-light convention: green for healthy, amber for warnings, red
  // for errors. The old wiring used the brand accent for healthy, which
  // made it hard to spot actual issues next to cyan-accented UI chrome.
  const tone =
    state === 'healthy'
      ? 'bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.18)]'
      : state === 'degraded'
        ? 'bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]'
        : state === 'error'
          ? 'bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.22)]'
          : 'bg-text-muted/40';
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block h-2 w-2 rounded-full ${tone}`} />
      {label && <span className="text-[13px] text-text-muted">{label}</span>}
    </span>
  );
}

export function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-0.5 text-[13px] text-text-primary ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
