import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors `AdCreativesView` / `AdCreativesHub` workspace: sticky glass header, tab strip,
 * and a compact centered card like the empty gallery state (`max-w-md`).
 */
export function AdCreativesWorkspaceSkeleton() {
  return (
    <div className="cortex-page-gutter max-w-7xl mx-auto space-y-8">
      <div className="sticky top-0 z-40 -mx-6 sm:-mx-8 px-6 sm:px-8 pt-1 pb-2">
        <div className="rounded-2xl border border-white/[0.1] bg-surface/65 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.65)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/55">
          <div className="flex flex-col gap-3 p-3 sm:p-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                <Skeleton className="mt-0.5 h-8 w-8 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-2.5 w-24 rounded" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-7 w-44 max-w-[min(100%,240px)] rounded-md" />
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-4 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-28 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-11 w-full max-w-[220px] rounded-full sm:ml-auto" />
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.06] bg-background/25 p-1 backdrop-blur-sm">
              <Skeleton className="h-9 flex-1 min-w-[6rem] rounded-lg sm:h-9 sm:flex-initial sm:w-[7.5rem]" />
              <Skeleton className="h-9 flex-1 min-w-[6rem] rounded-lg sm:h-9 sm:flex-initial sm:w-32" />
              <Skeleton className="h-9 flex-1 min-w-[6rem] rounded-lg sm:h-9 sm:flex-initial sm:w-[7.25rem]" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-10 sm:py-14 px-4">
        <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-nativz-border/70 bg-surface px-8 py-14 text-center shadow-[0_28px_80px_-40px_rgba(0,0,0,0.75)]">
          <div className="relative mx-auto max-w-xs space-y-5">
            <Skeleton className="mx-auto h-3 w-14 rounded" />
            <Skeleton className="mx-auto h-[4.5rem] w-[4.5rem] rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="mx-auto h-7 w-48 max-w-full rounded-md" />
              <Skeleton className="mx-auto h-4 w-full max-w-[280px] rounded" />
              <Skeleton className="mx-auto h-4 w-full max-w-[240px] rounded" />
            </div>
            <Skeleton className="mx-auto mt-2 h-11 w-full max-w-[200px] rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Mirrors the hub landing (`!hasContext`): centered hero, command, recent grid.
 */
export function AdCreativesHubLandingSkeleton() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-8">
        <div className="mx-auto max-w-lg space-y-3 text-center">
          <Skeleton className="mx-auto h-10 w-full max-w-md rounded-lg" />
          <Skeleton className="mx-auto h-4 w-full max-w-sm rounded" />
        </div>
        <div className="mx-auto w-full max-w-2xl space-y-5">
          <Skeleton className="h-14 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
