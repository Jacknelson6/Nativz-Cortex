import { Skeleton } from '@/components/ui/skeleton';

/**
 * Brain (Knowledge) skeleton — explorer with filters at top + list or
 * graph view below. Shows a list shape since that's the default view.
 */
export default function BrainLoading() {
  return (
    <div className="cortex-page-gutter py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-44 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg ml-auto" />
      </div>

      {/* View-switch tabs (list / graph / meetings) */}
      <div className="flex gap-2 border-b border-nativz-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-t-lg" />
        ))}
      </div>

      {/* Entry list — each row has a small header + content preview + tags */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-nativz-border bg-surface p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <div className="flex gap-1.5 pt-1">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
