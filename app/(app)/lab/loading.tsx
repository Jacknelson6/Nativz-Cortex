import { Skeleton } from '@/components/ui/skeleton';

/**
 * Strategy Lab skeleton — the workspace is a full-height chat UI on
 * the right with a left rail of tools (pillars, boards, history). The
 * fallback ContentLabGeneralChat (no brand pinned) collapses to a
 * single centered chat input — this skeleton matches the branded
 * workspace since that's the common case.
 */
export default function StrategyLabLoading() {
  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden flex">
      {/* Left rail — pillars, boards, history, moodboards */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-nativz-border p-4 gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
        <div className="space-y-2 pt-2 border-t border-nativz-border">
          <Skeleton className="h-4 w-20" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-2 pt-2 border-t border-nativz-border">
          <Skeleton className="h-4 w-16" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
        </div>
      </aside>

      {/* Main chat column */}
      <div className="flex-1 flex flex-col">
        {/* Scrollable chat transcript area */}
        <div className="flex-1 overflow-hidden p-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-10/12" />
              </div>
            ))}
          </div>
        </div>

        {/* Chat input bar at bottom */}
        <div className="border-t border-nativz-border p-4">
          <div className="max-w-3xl mx-auto">
            <Skeleton className="h-12 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
