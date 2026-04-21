import { Skeleton } from '@/components/ui/skeleton';

/**
 * Ad Generator skeleton — a tabbed workspace with a chat panel on the
 * right and a gallery / batches grid on the left. When no brand is
 * pinned the page shows a small empty state; we skeleton the branded
 * common case.
 */
export default function AdGeneratorLoading() {
  return (
    <div className="cortex-page-gutter py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-nativz-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-t-lg" />
        ))}
      </div>

      {/* Two-pane workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* Main — gallery / batches */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
                <Skeleton className="aspect-square w-full" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right rail — chat */}
        <aside className="rounded-xl border border-nativz-border bg-surface p-4 flex flex-col gap-3 h-[600px]">
          <Skeleton className="h-5 w-24" />
          <div className="flex-1 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            ))}
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
        </aside>
      </div>
    </div>
  );
}
