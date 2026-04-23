import { Skeleton } from '@/components/ui/skeleton';

export default function ClientsLoading() {
  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      {/* SectionHeader skeleton */}
      <header className="space-y-2">
        <Skeleton className="h-2 w-28 rounded-full" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
      </header>

      {/* Client grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
