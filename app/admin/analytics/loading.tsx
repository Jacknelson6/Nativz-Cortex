import { Skeleton } from '@/components/ui/skeleton';

export default function AnalyticsLoading() {
  return (
    <div className="cortex-page-gutter">
      <Skeleton className="h-[70vh] w-full rounded-xl" />
    </div>
  );
}
