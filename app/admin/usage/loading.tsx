import { Skeleton } from '@/components/ui/skeleton';

/**
 * Infrastructure page skeleton — mirrors the actual layout (header,
 * 4-stat summary strip, configured-models card, recent-runs table) so
 * content doesn't jump when the server data lands.
 */
export default function InfrastructureLoading() {
  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-44 rounded-lg" />
        <Skeleton className="h-4 w-full max-w-xl rounded" />
      </div>

      {/* Summary strip — 4 stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-nativz-border bg-surface px-4 py-3 space-y-2">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-6 w-16 rounded" />
            <Skeleton className="h-3 w-28 rounded" />
          </div>
        ))}
      </div>

      {/* Configured models card */}
      <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-56 rounded" />
          <Skeleton className="h-5 w-32 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-nativz-border/60 bg-surface-hover/30 px-3 py-2 space-y-1.5">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="h-4 w-full rounded" />
            </div>
          ))}
        </div>
        <Skeleton className="h-3 w-3/4 rounded" />
      </div>

      {/* Recent runs */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-40 rounded" />
        <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-nativz-border/60 px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-3.5 w-3.5 rounded shrink-0" />
              <Skeleton className="h-3 w-16 shrink-0 rounded" />
              <Skeleton className="h-4 flex-1 rounded" />
              <Skeleton className="h-4 w-20 shrink-0 rounded-full" />
              <Skeleton className="h-3 w-16 shrink-0 rounded" />
              <Skeleton className="hidden h-3 w-32 shrink-0 rounded md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
