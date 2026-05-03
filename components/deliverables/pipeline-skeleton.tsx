/**
 * PipelineSkeleton - loading placeholder for the pipeline view.
 *
 * 5 columns with 2 ghost cards each, matching the live layout's spacing
 * so the page doesn't reflow when data lands.
 */

const COLUMNS = ['Unstarted', 'In edit', 'In review', 'Approved', 'Delivered'];

export function PipelineSkeleton() {
  return (
    <section className="rounded-2xl border border-nativz-border bg-surface p-6">
      <header className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          In flight
        </p>
        <h2 className="text-lg font-semibold text-text-primary">Production pipeline</h2>
      </header>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNS.map((label) => (
          <div key={label} className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {label}
            </div>
            <div className="h-[68px] animate-pulse rounded-xl bg-background/60" />
            <div className="h-[68px] animate-pulse rounded-xl bg-background/40" />
          </div>
        ))}
      </div>
    </section>
  );
}
