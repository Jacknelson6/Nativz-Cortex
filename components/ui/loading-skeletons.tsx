'use client';

import { Loader2 } from 'lucide-react';
import { Skeleton } from './skeleton';

export function SkeletonRows({
  count = 6,
  withAvatar = true,
}: {
  count?: number;
  withAvatar?: boolean;
}) {
  return (
    <ul className="divide-y divide-nativz-border" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="px-5 py-3.5 flex items-center gap-3"
          style={{ opacity: 1 - i * 0.08 }}
        >
          {withAvatar ? <Skeleton className="h-9 w-9 shrink-0 rounded-full" /> : null}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full shrink-0" />
        </li>
      ))}
    </ul>
  );
}

export function SkeletonCards({
  count = 3,
  cols = 3,
}: {
  count?: number;
  cols?: 1 | 2 | 3 | 4;
}) {
  const gridClass =
    cols === 1
      ? 'grid-cols-1'
      : cols === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : cols === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div
      className={`grid ${gridClass} gap-3 p-5`}
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-nativz-border bg-surface/40 p-4 space-y-3"
          style={{ opacity: 1 - i * 0.1 }}
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-5/6" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full" aria-busy="true" aria-label="Loading">
      <div className="px-5 py-3 border-b border-nativz-border grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16" />
        ))}
      </div>
      <div className="divide-y divide-nativz-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="px-5 py-3.5 grid gap-3 items-center"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              opacity: 1 - r * 0.06,
            }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-3 ${c === 0 ? 'w-1/2' : 'w-2/3'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function InlineSpinner({ label }: { label: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 p-12 text-sm text-text-muted"
      aria-busy="true"
    >
      <Loader2 size={14} className="animate-spin text-accent-text" />
      <span>{label}</span>
    </div>
  );
}
