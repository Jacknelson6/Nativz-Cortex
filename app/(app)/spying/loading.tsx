import { Skeleton } from '@/components/ui/skeleton';

export default function CompetitorIntelligenceLoading() {
  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-40 rounded" />
          <Skeleton className="h-8 w-48 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-32 rounded-full" />
      </header>

      {/* Audit quick start */}
      <section className="rounded-xl border border-nativz-border bg-surface p-6 space-y-4">
        <Skeleton className="h-2.5 w-20 rounded" />
        <Skeleton className="h-5 w-80 max-w-full rounded" />
        <Skeleton className="h-3 w-72 max-w-full rounded" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-11 flex-1 rounded-lg" />
          <Skeleton className="h-11 w-32 rounded-full" />
        </div>
      </section>

      {/* Stat strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-nativz-border bg-surface p-4 space-y-2">
            <Skeleton className="h-2.5 w-24 rounded" />
            <Skeleton className="h-7 w-16 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
        ))}
      </section>

      {/* Latest audits, watched competitors, recurring reports — all share row-list shape */}
      {Array.from({ length: 3 }).map((_, sectionIdx) => (
        <section key={sectionIdx} className="space-y-3">
          <div className="flex items-end justify-between">
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-16 rounded" />
              <Skeleton className="h-5 w-48 rounded" />
            </div>
            <Skeleton className="h-3 w-20 rounded" />
          </div>
          <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-nativz-border/60 px-4 py-3 last:border-0"
              >
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3 w-40 rounded" />
                  <Skeleton className="h-2.5 w-28 rounded" />
                </div>
                <Skeleton className="h-4 w-12 rounded-full" />
                <Skeleton className="h-3 w-12 rounded" />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Tool rail */}
      <section className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-16 rounded" />
          <Skeleton className="h-5 w-44 rounded" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 rounded-xl border border-nativz-border bg-surface p-5">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-32 rounded" />
                <Skeleton className="h-2.5 w-40 rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
