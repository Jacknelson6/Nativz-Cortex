import { Skeleton } from '@/components/ui/skeleton';

export default function PortalCalendarLoading() {
  return (
    <div className="cortex-page-gutter max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-56" />
      </div>
      {Array.from({ length: 2 }).map((_, gi) => (
        <div key={gi} className="space-y-3">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-nativz-border bg-surface px-5 py-4 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
