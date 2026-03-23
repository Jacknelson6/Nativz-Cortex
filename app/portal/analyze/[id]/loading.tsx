import { Skeleton } from '@/components/ui/skeleton';

export default function PortalAnalyzeBoardLoading() {
  return (
    <div className="cortex-page-gutter max-w-5xl mx-auto space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
            <Skeleton className="h-36 w-full rounded-none" />
            <div className="px-4 py-3 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
