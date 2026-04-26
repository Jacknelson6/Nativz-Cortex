interface SpyStat {
  label: string;
  value: string;
  hint?: string;
}

interface SpyStatStripProps {
  stats: SpyStat[];
}

export function SpyStatStrip({ stats }: SpyStatStripProps) {
  return (
    <section
      className="animate-ci-rise grid grid-cols-2 gap-3 md:grid-cols-4"
      style={{ animationDelay: '120ms' }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-nativz-border bg-surface p-4"
        >
          <p className="ui-eyebrow text-text-muted/85">{stat.label}</p>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-text-primary">
            {stat.value}
          </p>
          {stat.hint ? (
            <p className="mt-1 text-[11px] text-text-muted/80">{stat.hint}</p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
