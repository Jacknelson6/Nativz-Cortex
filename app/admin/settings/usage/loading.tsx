import { Skeleton } from '@/components/ui/skeleton';

export default function UsageLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Date range selector */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-14 rounded-lg" />
        ))}
      </div>

      {/* Total cost card */}
      <Skeleton className="h-28 w-full rounded-xl" />

      {/* Service breakdown cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>

      {/* Chart */}
      <Skeleton className="h-64 rounded-xl" />

      {/* Table */}
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
