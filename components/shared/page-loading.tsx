import { Skeleton } from '@/components/ui/skeleton';

/**
 * Default page-level loading skeleton. Used as the fallback for routes that
 * don't need a bespoke `loading.tsx`. Renders an instant-paint shell so
 * `<Link>` navigation swaps the old page out immediately instead of leaving
 * the previous screen frozen while the server component fetches.
 */
export default function PageLoading() {
  return (
    <div className="cortex-page-gutter space-y-5">
      <div>
        <Skeleton className="mb-2 h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[140px] space-y-3 rounded-xl border border-nativz-border bg-surface p-4"
          >
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
