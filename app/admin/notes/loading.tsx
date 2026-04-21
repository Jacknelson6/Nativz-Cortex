import { Skeleton } from '@/components/ui/skeleton';

/**
 * Notes dashboard skeleton — list of moodboards grouped by scope
 * (personal / team / per-client). Each board is a card with a
 * thumbnail grid preview + metadata.
 */
export default function NotesLoading() {
  return (
    <div className="cortex-page-gutter py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>

      {/* Two scope sections — Personal + Team (+ Clients) */}
      {Array.from({ length: 2 }).map((_, section) => (
        <section key={section} className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-nativz-border bg-surface overflow-hidden"
              >
                {/* Thumbnail grid preview */}
                <div className="grid grid-cols-2 gap-0.5 aspect-video bg-background/30">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="rounded-none" />
                  ))}
                </div>
                {/* Title + meta */}
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
