import { Skeleton } from '@/components/ui/skeleton';

export default function TrendMonitorsLoading() {
  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <header className="space-y-2">
        <Skeleton className="h-3 w-40 rounded" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56 rounded-lg" />
            <Skeleton className="h-4 w-full max-w-xl rounded" />
            <Skeleton className="h-4 w-5/6 max-w-md rounded" />
          </div>
          <Skeleton className="h-9 w-36 rounded-full" />
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          <Skeleton className="h-3 w-36 rounded" />
          <Skeleton className="h-3 w-36 rounded" />
        </div>
      </header>

      <section className="space-y-3">
        <Skeleton className="h-4 w-40 rounded" />
        <div className="space-y-2 rounded-xl border border-nativz-border bg-surface p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-4 w-40 rounded" />
        <div className="space-y-2 rounded-xl border border-nativz-border bg-surface p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </section>
    </div>
  );
}
