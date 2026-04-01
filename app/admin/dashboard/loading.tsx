import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="cortex-page-gutter space-y-5">
      <div>
        <Skeleton className="mb-2 h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Bento quick actions — matches page grid (5 columns, 140px rows) */}
      <div className="grid auto-rows-[140px] grid-cols-[1fr_1fr_1fr_1fr_minmax(200px,1.2fr)] gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex min-w-[140px] flex-col justify-between rounded-2xl border border-nativz-border/60 bg-surface p-5"
          >
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="mt-auto space-y-2 pt-6">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
        <div className="flex min-w-[200px] flex-col justify-between rounded-2xl border border-accent/30 bg-surface p-5">
          <div className="flex items-start justify-between">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <Skeleton className="h-4 w-10 rounded" />
          </div>
          <div className="mt-auto space-y-2 pt-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
      </div>

      {/* Tasks + notifications */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="min-h-[200px] space-y-3 rounded-xl border border-nativz-border bg-surface p-4">
          <Skeleton className="h-5 w-28" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
        <div className="min-h-[200px] space-y-3 rounded-xl border border-nativz-border bg-surface p-4">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
