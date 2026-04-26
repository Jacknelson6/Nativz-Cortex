/**
 * Skeleton primitive — single source of truth for loading-state shells.
 *
 * Default `<Skeleton/>` paints a tinted rounded rectangle with a slow
 * pulse. Wrap groups of skeletons in a container that carries
 * `role="status"` + `aria-busy="true"` (or use `<SkeletonGroup/>`) so
 * screen readers announce "loading" instead of skipping silently.
 *
 * The composite helpers (`CardSkeleton`, `TableSkeleton`,
 * `DashboardSkeleton`) used to live in a parallel
 * `components/shared/loading-skeleton.tsx` that had drifted to a
 * different paint color and zero call-sites — consolidated here so
 * the codebase reaches for one place.
 */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-white/[0.06] ${className ?? ''}`}
    />
  );
}

/**
 * Wrapper that announces "loading" to assistive tech and pulls the
 * decorative `<Skeleton/>` children out of the SR tree. Use this around
 * any skeleton block that replaces meaningful content.
 *
 * The visually-hidden span (`sr-only`) gives SRs a polite "Loading…"
 * cue while sighted users see the pulse animation. `aria-busy` flips
 * to `false` once the real content lands so SR users are told the
 * region updated.
 */
export function SkeletonGroup({
  children,
  label = 'Loading',
  className,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-6">
      <Skeleton className="mb-4 h-4 w-1/3" />
      <Skeleton className="mb-2 h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonGroup label="Loading table" className="space-y-3">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </SkeletonGroup>
  );
}

export function DashboardSkeleton() {
  return (
    <SkeletonGroup label="Loading dashboard" className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-nativz-border bg-surface p-6">
          <Skeleton className="mb-6 h-4 w-1/4" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="rounded-xl border border-nativz-border bg-surface p-6">
          <Skeleton className="mb-6 h-4 w-1/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </SkeletonGroup>
  );
}
