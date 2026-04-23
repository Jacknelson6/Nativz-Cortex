import { Skeleton } from '@/components/ui/skeleton';

/**
 * Generic page skeleton — drop-in for any `loading.tsx` where the route
 * renders a server component that does DB work before first paint. Matches
 * the shape of SectionHeader + a content grid so the skeleton doesn't
 * jank into a totally different layout once the real content arrives.
 *
 * Use when per-page custom skeletons aren't worth the effort — e.g. simple
 * settings subpages, onboarding steps, detail views.
 *
 * For higher-fidelity pages (dashboards, reports), write a tuned skeleton
 * at the route's own `loading.tsx` instead. See
 * `app/admin/clients/loading.tsx` for a tuned example.
 */
export function PageShellSkeleton({
  tiles = 6,
  showTopKicker = true,
  showAction = false,
  grid = 'cards',
}: {
  /** Number of placeholder tiles / rows below the header. */
  tiles?: number;
  /** Show the small uppercase "Cortex · admin" kicker line. */
  showTopKicker?: boolean;
  /** Show a right-aligned action button placeholder in the header. */
  showAction?: boolean;
  /** `cards` = grid of card-shaped tiles; `rows` = stacked table-ish rows. */
  grid?: 'cards' | 'rows';
}) {
  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        {showTopKicker ? <Skeleton className="h-2 w-28 rounded-full" /> : null}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          {showAction ? <Skeleton className="h-9 w-28" /> : null}
        </div>
      </header>

      {grid === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: tiles }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-nativz-border bg-surface">
          {Array.from({ length: tiles }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-nativz-border/60 p-4 last:border-b-0"
            >
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Tabbed settings-style skeleton — side nav of links + a right-hand form.
 * Tuned for the client settings subpages (general, brand, access, etc.)
 * so there's no layout shift when the real form mounts.
 */
export function SettingsShellSkeleton() {
  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <Skeleton className="h-2 w-28 rounded-full" />
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </header>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}
        </nav>
        <section className="rounded-xl border border-nativz-border bg-surface p-6 space-y-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Skeleton className="h-9 w-28" />
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Skeleton for a long-running processing view (topic search / ad batch /
 * audit). Matches the progress-bar + stage-list layout so the swap in is
 * seamless when the real processing UI mounts.
 */
export function ProcessingShellSkeleton() {
  return (
    <div className="cortex-page-gutter max-w-3xl mx-auto space-y-6 py-10">
      <div className="space-y-3 text-center">
        <Skeleton className="h-6 w-48 mx-auto" />
        <Skeleton className="h-4 w-80 mx-auto" />
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
        <Skeleton className="h-full w-1/3" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-nativz-border bg-surface p-4">
            <Skeleton className="h-5 w-5 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
