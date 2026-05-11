// VFF-07 T08: row-level loading skeleton.
// 6 9:16 placeholder cards in a horizontal row.

export function FormatRowSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[9/16] w-44 shrink-0 animate-pulse rounded-xl bg-white/5"
        />
      ))}
    </div>
  );
}
