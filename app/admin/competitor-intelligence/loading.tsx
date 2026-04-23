import { Skeleton } from '@/components/ui/skeleton';

/**
 * Competitor spying landing skeleton — mirrors the actual page layout
 * (hero + action band + latest audits strip + active watches strip + footer)
 * so the page paints instantly when navigating from the sidebar instead of
 * waiting on the server-side queries to resolve before showing any chrome.
 */
export default function CompetitorIntelligenceLoading() {
  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-12">
      {/* Hero */}
      <section className="space-y-3">
        <Skeleton className="h-3 w-32 rounded" />
        <Skeleton className="h-8 w-72 rounded-lg" />
        <Skeleton className="h-4 w-full max-w-2xl rounded" />
        <Skeleton className="h-4 w-5/6 max-w-xl rounded" />
      </section>

      {/* Action band */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        ))}
      </section>

      {/* Latest audits strip */}
      <section className="space-y-3">
        <Skeleton className="h-4 w-40 rounded" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
              <Skeleton className="h-6 w-16 rounded" />
              <Skeleton className="h-3 w-32 rounded" />
            </div>
          ))}
        </div>
      </section>

      {/* Active watches strip */}
      <section className="space-y-3">
        <Skeleton className="h-4 w-40 rounded" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3 w-32 rounded" />
              </div>
              <Skeleton className="h-12 w-full rounded" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-3 w-12 rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
