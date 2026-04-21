import { Skeleton } from '@/components/ui/skeleton';

/**
 * Competitor Spying → Organic Social skeleton. Shape: URL input hero
 * card, then a grid of previous audit cards. Mobile stacks to one col.
 */
export default function AnalyzeSocialLoading() {
  return (
    <div className="cortex-page-gutter py-8 space-y-8">
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* URL input hero */}
      <div className="rounded-2xl border border-nativz-border bg-surface p-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-11 flex-1 rounded-lg" />
          <Skeleton className="h-11 w-32 rounded-lg" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
      </div>

      {/* Previous audits grid */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-20 w-full rounded-lg" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
