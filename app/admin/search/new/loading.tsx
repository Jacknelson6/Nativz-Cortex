import { Skeleton } from '@/components/ui/skeleton';

/**
 * Trend Finder skeleton — two-column grid on lg+ (history rail left,
 * centered hero right). Mobile stacks. Matches ResearchHub's actual
 * layout so the content doesn't jump on hydration.
 */
export default function TrendFinderLoading() {
  return (
    <div className="flex min-h-0 flex-col px-6 pb-12 sm:px-8 lg:pl-0 lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden">
      <section className="flex w-full flex-1 flex-col pt-6 sm:pt-8 md:pt-12 lg:pt-0">
        <div className="flex min-h-0 flex-1 flex-col gap-8 lg:grid lg:h-full lg:gap-0 lg:overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* History rail */}
          <aside className="flex min-h-0 w-full flex-col lg:col-start-1 lg:row-start-1 lg:h-full lg:overflow-hidden border-r border-nativz-border">
            <div className="p-4 space-y-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <div className="space-y-2 pt-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            </div>
          </aside>

          {/* Main column — centered hero */}
          <div className="flex min-w-0 w-full shrink-0 justify-center lg:col-start-2 lg:row-start-1 lg:h-full lg:flex-col lg:items-center lg:justify-center lg:overflow-hidden">
            <div className="w-full max-w-3xl -translate-y-1.5 lg:-translate-y-2">
              <div className="w-full">
                {/* Hey, X / What's trending */}
                <div className="text-center space-y-2">
                  <Skeleton className="mx-auto h-4 w-20" />
                  <Skeleton className="mx-auto h-7 w-56" />
                </div>

                {/* Search card */}
                <div className="mx-auto mt-4 w-full max-w-xl rounded-[1.75rem] border border-nativz-border bg-surface-hover/35 overflow-hidden md:mt-5">
                  <div className="px-4 pt-4 pb-2 md:px-5 md:pt-5">
                    <Skeleton className="h-5 w-52" />
                  </div>
                  <div className="flex items-center gap-2 border-t border-nativz-border/60 px-3 pb-3 pt-2">
                    <div className="flex flex-1 flex-nowrap items-center gap-2">
                      <Skeleton className="h-9 w-32 rounded-full" />
                      <Skeleton className="h-9 w-40 rounded-full" />
                    </div>
                    <Skeleton className="h-10 w-10 rounded-full" />
                  </div>
                </div>

                {/* Suggest-topics CTA */}
                <div className="mx-auto mt-3 w-full max-w-xl flex justify-center">
                  <Skeleton className="h-7 w-64 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
