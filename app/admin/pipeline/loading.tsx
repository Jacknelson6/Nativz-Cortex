import { Skeleton } from '@/components/ui/skeleton';

export default function PipelineLoading() {
  return (
    <div className="cortex-page-gutter space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
        <div className="grid grid-cols-12 gap-px bg-nativz-border/30 p-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-12 gap-4 p-3 border-t border-nativz-border">
            <Skeleton className="h-5 w-full col-span-2" />
            {Array.from({ length: 10 }).map((_, j) => (
              <Skeleton key={j} className="h-5 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
