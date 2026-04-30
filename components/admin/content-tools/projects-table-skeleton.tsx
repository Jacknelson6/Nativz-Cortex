/** Loading skeleton for the Projects tab. Matches the legacy
 *  `<ReviewTableSkeleton>` shape so the perceived render path
 *  doesn't shift when the new shell takes over. */
export function ProjectsTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="border-b border-nativz-border px-5 py-4">
        <div className="h-4 w-32 animate-pulse rounded bg-nativz-border" />
      </div>
      <div className="divide-y divide-nativz-border/60">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="size-8 animate-pulse rounded-md bg-nativz-border" />
            <div className="h-4 w-40 animate-pulse rounded bg-nativz-border" />
            <div className="ml-auto h-6 w-24 animate-pulse rounded bg-nativz-border" />
          </div>
        ))}
      </div>
    </div>
  );
}
