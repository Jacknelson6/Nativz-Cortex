import { Skeleton } from '@/components/ui/skeleton';

export default function PortalSettingsLoading() {
  return (
    <div className="cortex-page-gutter space-y-6 max-w-2xl mx-auto">
      <Skeleton className="h-7 w-24" />

      {/* Account card */}
      <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
        <Skeleton className="h-5 w-20" />
        <div className="space-y-3">
          <div>
            <Skeleton className="h-3 w-12 mb-1.5" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div>
            <Skeleton className="h-3 w-12 mb-1.5" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>

      {/* Brand profile card */}
      <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
        <Skeleton className="h-5 w-28" />
        <div className="space-y-3">
          <div>
            <Skeleton className="h-3 w-16 mb-1.5" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div>
            <Skeleton className="h-3 w-16 mb-1.5" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div>
            <Skeleton className="h-3 w-20 mb-1.5" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <div>
            <Skeleton className="h-3 w-20 mb-1.5" />
            <Skeleton className="h-4 w-52" />
          </div>
          <div>
            <Skeleton className="h-3 w-24 mb-1.5" />
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-20 rounded-full" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Password card */}
      <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-3 w-64" />
        <div className="space-y-3">
          <div>
            <Skeleton className="h-3 w-24 mb-1.5" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div>
            <Skeleton className="h-3 w-32 mb-1.5" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </div>
  );
}
