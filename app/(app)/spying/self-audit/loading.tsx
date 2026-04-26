import { Skeleton } from '@/components/ui/skeleton';

export default function SelfAuditIndexLoading() {
  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-36 rounded" />
          <Skeleton className="h-7 w-96 max-w-full rounded-lg" />
          <Skeleton className="h-3 w-[28rem] max-w-full rounded" />
        </div>
        <Skeleton className="h-9 w-44 rounded-full" />
      </header>

      <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
        <Skeleton className="h-3 w-72 rounded" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-3 w-48 rounded" />
        <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
