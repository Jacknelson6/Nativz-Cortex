import { Skeleton } from '@/components/ui/skeleton';

export default function IdeaGeneratorLoading() {
  return (
    <div className="cortex-page-gutter">
      <div className="max-w-5xl mx-auto pt-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>

        {/* Controls */}
        <div className="bg-surface rounded-xl border border-nativz-border p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>

        {/* Empty state placeholder */}
        <div className="flex flex-col items-center justify-center py-16">
          <Skeleton className="h-14 w-14 rounded-2xl mb-4" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    </div>
  );
}
