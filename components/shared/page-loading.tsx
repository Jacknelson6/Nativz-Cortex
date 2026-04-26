import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

/**
 * Generic page-level loading shell. Used as the fallback for routes
 * that don't ship a bespoke `loading.tsx`. Renders an instant-paint
 * skeleton so `<Link>` navigation swaps the old page out immediately
 * instead of leaving the previous screen frozen while the server
 * component fetches.
 *
 * Shape is intentionally neutral — a header bar + a tall content
 * surface — so it works for both card-grid and table-style pages
 * without snapping. Pages that want a more specific fallback should
 * export their own `loading.tsx` using `<TableLoading/>` or a custom
 * composition.
 */
export default function PageLoading() {
  return (
    <SkeletonGroup label="Loading page" className="cortex-page-gutter space-y-5">
      <div>
        <Skeleton className="mb-2 h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="rounded-xl border border-nativz-border bg-surface p-4">
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </SkeletonGroup>
  );
}

/**
 * Roster/table-style page loading shell — header + filter chips +
 * paged table skeleton. Use as `loading.tsx` for pages that render a
 * data table (sales, clients, revenue, accounting, onboarding…).
 */
export function TableLoading({ rows = 8 }: { rows?: number }) {
  return (
    <SkeletonGroup label="Loading table" className="cortex-page-gutter space-y-5">
      {/* Page header */}
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>

      {/* Headline metric strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[60px]" />
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-20 rounded-full" />
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
        <div className="space-y-0 divide-y divide-nativz-border/60">
          <Skeleton className="h-9 w-full rounded-none" />
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-none" />
          ))}
        </div>
      </div>
    </SkeletonGroup>
  );
}
