'use client';

import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Shared "Refresh" button for tabbed admin pages. Pair with a server
 * action that calls `revalidateTag(<section-tag>)` so the next render
 * pulls fresh data from the DB instead of the cached result.
 *
 * Usage:
 *   <RefreshButton action={refreshAiSettings} />
 */
export function RefreshButton({ action }: { action: () => Promise<unknown> }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await action();
        })
      }
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-full border border-nativz-border bg-surface/70 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/35 hover:text-accent-text disabled:opacity-60"
    >
      <RefreshCw size={13} className={pending ? 'animate-spin' : ''} />
      {pending ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}
