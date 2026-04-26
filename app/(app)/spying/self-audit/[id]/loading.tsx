import { Skeleton } from '@/components/ui/skeleton';

export default function SelfAuditDetailLoading() {
  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-40 rounded" />
          <Skeleton className="h-8 w-80 max-w-full rounded-lg" />
          <Skeleton className="h-3 w-72 max-w-full rounded" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
            <Skeleton className="h-2.5 w-24 rounded" />
            <Skeleton className="h-7 w-20 rounded" />
            <Skeleton className="h-3 w-40 rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>

      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
