import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

/**
 * Shared skeleton for tabbed admin pages (AI settings, Accounting,
 * Onboarding, Clients, etc). Matches the SectionHeader → SectionTabs →
 * tile grid shape so the layout doesn't jump when content lands.
 *
 * Built on the canonical `<Skeleton/>` primitive so the pulse rhythm
 * + paint color stay identical to every other loading screen — Jack
 * flagged the old hand-rolled `bg-surface-hover/N` blocks for looking
 * subtly different from the rest of the app's loading states.
 *
 * Used from each page's loading.tsx — Next.js renders this while the
 * server component awaits its cached data load.
 */

interface TabbedPageSkeletonProps {
  /** Rough tile count to render in the overview grid. */
  tileCount?: number;
  /** Rough tab count to render in the pill nav. */
  tabCount?: number;
}

export function TabbedPageSkeleton({ tileCount = 6, tabCount = 6 }: TabbedPageSkeletonProps = {}) {
  return (
    <SkeletonGroup label="Loading page" className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <header className="space-y-2">
        <Skeleton className="h-2 w-28 rounded-full" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
        </div>
      </header>

      {/* Tab nav — matches the underlined strip from `components/ui/sub-nav.tsx`
          so the skeleton doesn't snap into a different shape on hydration. */}
      <nav
        aria-label="Loading section tabs"
        className="flex items-center gap-1 border-b border-nativz-border"
      >
        {Array.from({ length: tabCount }).map((_, i) => (
          <span key={i} className="px-3 py-2">
            <Skeleton className="inline-block h-3 w-16" />
          </span>
        ))}
      </nav>

      {/* Overview tile grid */}
      {tileCount > 0 ? (
        <div className="space-y-4">
          <Skeleton className="h-4 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: tileCount }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-xl border border-nativz-border bg-surface p-5"
              >
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </SkeletonGroup>
  );
}
