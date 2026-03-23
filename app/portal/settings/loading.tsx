import { Skeleton } from '@/components/ui/skeleton';

export default function PortalSettingsLoading() {
  return (
    <div className="cortex-page-gutter space-y-6 max-w-2xl">
      <Skeleton className="h-6 w-24" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="space-y-3">
            <div>
              <Skeleton className="h-3 w-16 mb-1.5" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div>
              <Skeleton className="h-3 w-16 mb-1.5" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
