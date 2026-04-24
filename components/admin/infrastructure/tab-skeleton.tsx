import { Skeleton } from '@/components/ui/skeleton';

/**
 * Generic skeleton used as the Suspense fallback for every Infrastructure
 * tab. Tabs are async server components that each do their own data
 * fetches; switching tabs re-runs the page RSC and React keeps the old
 * content visible until the new tab's await chain resolves. Dropping this
 * inside a Suspense boundary keyed on the active slug makes the fallback
 * paint the moment a tab is clicked, so it never feels frozen.
 *
 * Mirrors the rough shape shared by most tabs (stat strip + one or two
 * detail cards + a table) rather than any single tab's exact layout, so
 * it reads as "loading this section" regardless of which one just opened.
 */
export function InfrastructureTabSkeleton() {
  return (
    <div className="space-y-8">
      {/* Stat strip — 4 pills */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-nativz-border bg-surface px-4 py-3 space-y-2"
          >
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-6 w-16 rounded" />
            <Skeleton className="h-3 w-28 rounded" />
          </div>
        ))}
      </div>

      {/* Two side-by-side detail cards */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-48 rounded" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, row) => (
                <Skeleton key={row} className="h-4 w-full rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Table/list block */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-40 rounded" />
        <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-nativz-border/60 px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-3.5 w-3.5 rounded shrink-0" />
              <Skeleton className="h-3 w-16 shrink-0 rounded" />
              <Skeleton className="h-4 flex-1 rounded" />
              <Skeleton className="h-4 w-20 shrink-0 rounded-full" />
              <Skeleton className="h-3 w-16 shrink-0 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
