import { Skeleton } from '@/components/ui/skeleton';

export default function VersusLoading() {
  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-32 rounded" />
          <Skeleton className="h-7 w-72 rounded-lg" />
          <Skeleton className="h-3 w-96 max-w-full rounded" />
        </div>
      </header>

      <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        {[0, 1].map((slotIdx) => (
          <div key={slotIdx} className={slotIdx === 1 ? 'order-3 md:order-none' : ''}>
            <div className="space-y-3 rounded-xl border border-nativz-border bg-surface p-4">
              <Skeleton className="h-2.5 w-12 rounded" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 rounded" />
                  <Skeleton className="h-2.5 w-24 rounded" />
                </div>
              </div>
              <Skeleton className="h-9 w-full rounded-full" />
            </div>
          </div>
        ))}
        <div className="order-2 hidden items-center justify-center md:flex">
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-10">
        <Skeleton className="mx-auto h-3 w-72 rounded" />
      </div>
    </div>
  );
}
