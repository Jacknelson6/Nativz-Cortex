import { Skeleton } from '@/components/ui/skeleton';

export default function PortalPreferencesLoading() {
  return (
    <div className="cortex-page-gutter space-y-6 max-w-2xl mx-auto">
      <div>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 mt-2" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-3 w-48" />
        </div>
      ))}
    </div>
  );
}
