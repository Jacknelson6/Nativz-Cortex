import { Skeleton } from '@/components/ui/skeleton';

/**
 * Brand Profile skeleton — mirrors the unified /brand-profile tree
 * (admin + viewer share the same shape). Header card (logo / name /
 * description / facts) + essence card + social-presence card + DNA
 * bento.
 */
export default function BrandProfileLoading() {
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-nativz-border bg-surface p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="h-16 w-16 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 border-t border-nativz-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Essence */}
      <SectionSkeleton titleWidth="w-28">
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-2/3" />
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-nativz-border bg-surface p-5 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ))}
        </div>
      </SectionSkeleton>

      {/* Social presence — 2-col */}
      <SectionSkeleton titleWidth="w-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-nativz-border bg-surface p-6 space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-56" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3 rounded-lg border border-nativz-border bg-background/30 px-3 py-2.5">
                    <Skeleton className="h-5 w-5 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-4 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionSkeleton>

      {/* Brand DNA bento — 3-col on lg */}
      <SectionSkeleton titleWidth="w-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-nativz-border bg-surface/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </SectionSkeleton>
    </div>
  );
}

function SectionSkeleton({
  titleWidth,
  children,
}: {
  titleWidth: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className={`h-4 ${titleWidth}`} />
      </div>
      {children}
    </section>
  );
}
