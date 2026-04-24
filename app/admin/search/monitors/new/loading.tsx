import { Skeleton } from '@/components/ui/skeleton';

export default function NewTrendMonitorLoading() {
  return (
    <div className="cortex-page-gutter max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <Skeleton className="h-3 w-36 rounded" />
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-4 w-full max-w-xl rounded" />
        <Skeleton className="h-3 w-36 rounded" />
      </header>

      <div className="space-y-4 rounded-xl border border-nativz-border bg-surface p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </div>
    </div>
  );
}
