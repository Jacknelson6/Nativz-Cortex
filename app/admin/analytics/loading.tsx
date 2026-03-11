import { Skeleton } from '@/components/ui/skeleton';

export default function AnalyticsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-nativz-border bg-surface p-5">
            <Skeleton className="h-4 w-20 mb-3" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-nativz-border bg-surface p-5">
        <Skeleton className="h-5 w-36 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
