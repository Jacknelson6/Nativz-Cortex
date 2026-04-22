'use client';

import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { refreshInfrastructure } from '@/app/admin/infrastructure/actions';

export function RefreshButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await refreshInfrastructure();
        })
      }
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-full border border-nativz-border bg-surface/70 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-cyan-500/30 hover:text-cyan-200 disabled:opacity-60"
    >
      <RefreshCw size={13} className={pending ? 'animate-spin' : ''} />
      {pending ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}
