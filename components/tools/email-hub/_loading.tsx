'use client';

import { Loader2 } from 'lucide-react';

export function EmailHubSkeletonRows({
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
          {withAvatar ? (
            <div className="h-9 w-9 shrink-0 rounded-full bg-nativz-border/50 animate-pulse" />
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-1/3 rounded bg-nativz-border/60 animate-pulse" />
            <div className="h-2.5 w-2/3 rounded bg-nativz-border/40 animate-pulse" />
          </div>
          <div className="h-5 w-14 rounded-full bg-nativz-border/40 animate-pulse shrink-0" />
        </li>
      ))}
    </ul>
  );
}

export function EmailHubSkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-nativz-border bg-surface/40 p-4 space-y-3"
          style={{ opacity: 1 - i * 0.1 }}
        >
          <div className="h-4 w-2/3 rounded bg-nativz-border/60 animate-pulse" />
          <div className="h-2.5 w-full rounded bg-nativz-border/40 animate-pulse" />
          <div className="h-2.5 w-5/6 rounded bg-nativz-border/40 animate-pulse" />
          <div className="flex gap-2 pt-1">
            <div className="h-5 w-16 rounded-full bg-nativz-border/40 animate-pulse" />
            <div className="h-5 w-12 rounded-full bg-nativz-border/40 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmailHubSpinner({ label }: { label: string }) {
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
