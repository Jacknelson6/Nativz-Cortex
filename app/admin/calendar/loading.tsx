import { Skeleton } from '@/components/ui/skeleton';

export default function CalendarLoading() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px rounded-xl border border-nativz-border bg-surface overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="p-2 text-center">
            <Skeleton className="h-4 w-8 mx-auto" />
          </div>
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="p-2 min-h-24 border-t border-nativz-border">
            <Skeleton className="h-4 w-6 mb-2" />
            {i % 3 === 0 && <Skeleton className="h-5 w-full rounded" />}
          </div>
        ))}
      </div>
    </div>
  );
}
