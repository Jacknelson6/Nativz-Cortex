export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-hover ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-surface rounded-xl border border-nativz-border p-6 shadow-sm">
      <Skeleton className="h-4 w-1/3 mb-4" />
      <Skeleton className="h-8 w-1/2 mb-2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-surface rounded-xl border border-nativz-border p-6 shadow-sm">
          <Skeleton className="h-4 w-1/4 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="bg-surface rounded-xl border border-nativz-border p-6 shadow-sm">
          <Skeleton className="h-4 w-1/4 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
