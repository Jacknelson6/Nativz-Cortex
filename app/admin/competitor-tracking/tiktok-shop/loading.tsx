import { Skeleton } from '@/components/ui/skeleton';

/**
 * TikTok Shop skeleton — search-driven page with results shown as a
 * vertical list of searches, each expanding to show scraped products.
 * Skeleton shows the search header + 3 prior search rows.
 */
export default function TikTokShopLoading() {
  return (
    <div className="cortex-page-gutter py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Search input */}
      <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3">
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
      </div>

      {/* Search history list */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
            {/* Product thumbnails row */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="aspect-square rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
