import { Skeleton } from '@/components/ui/skeleton';

export default function ClientsLoading() {
  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      {/* SectionHeader skeleton — title-only post 2026-04-25 + matches the
          .ui-page-title scale (text-3xl → h-9). The subtitle skeleton was
          retired alongside the live subtitle to prevent layout shift on
          load. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </header>

      {/* Card skeletons match the live ClientCard chrome: rounded-[10px],
          border, p-4, md logo. Keeping the proportions tight avoids the
          flicker when the real grid mounts. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[10px] border border-nativz-border bg-surface p-4"
          >
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
