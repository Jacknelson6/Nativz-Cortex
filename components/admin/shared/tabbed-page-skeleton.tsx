/**
 * Shared skeleton for tabbed admin pages (AI settings, Accounting,
 * Onboarding, Clients, etc). Matches the SectionHeader → SectionTabs →
 * tile grid shape so the layout doesn't jump when content lands.
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
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <header className="space-y-2">
        <div className="h-2 w-28 rounded-full bg-surface-hover/60" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3">
            <div className="h-7 w-48 rounded-md bg-surface-hover/60" />
            <div className="h-4 w-96 max-w-full rounded-md bg-surface-hover/40" />
          </div>
        </div>
      </header>

      {/* Tab nav */}
      <nav
        aria-label="Loading section tabs"
        className="flex flex-wrap items-center gap-1 rounded-full border border-nativz-border bg-surface/70 p-1 backdrop-blur"
      >
        {Array.from({ length: tabCount }).map((_, i) => (
          <span
            key={i}
            className="inline-flex h-7 w-24 items-center gap-2 rounded-full bg-surface-hover/30 px-3"
          />
        ))}
      </nav>

      {/* Overview tile grid */}
      <div className="space-y-4">
        <div className="h-4 w-64 rounded-md bg-surface-hover/30" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: tileCount }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-4 rounded-xl border border-nativz-border bg-surface p-5"
            >
              <div className="h-10 w-10 shrink-0 rounded-full bg-surface-hover/50" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-24 rounded-md bg-surface-hover/50" />
                <div className="h-4 w-40 max-w-full rounded-md bg-surface-hover/30" />
                <div className="h-3 w-32 rounded-md bg-surface-hover/20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
