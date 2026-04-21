'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Legacy `/admin/strategy-lab/[clientId]` route. Strategy Lab's URL was
 * flattened to just `/admin/strategy-lab` — the session brand pill now
 * drives which client's workspace renders. This shim keeps old share
 * links, internal outbound references, and bookmarks alive by:
 *
 *   1. Writing the URL's clientId into the `x-admin-active-client` cookie
 *      via the existing /api/admin/active-client endpoint.
 *   2. `router.replace()`-ing to `/admin/strategy-lab` (preserves any
 *      `?attach=…` query param).
 *
 * A brief "Loading Strategy Lab…" state is rendered during the round-trip.
 * Once the cookie is set, the new page loads the brand-scoped workspace.
 */
export default function LegacyStrategyLabClientRedirect({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/admin/active-client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId }),
        });
        if (cancelled) return;

        // Even if the cookie POST fails (403 for a brand the user can't
        // see, 404 for a deleted client), fall forward to the flattened
        // route — the Strategy Lab page shows a graceful empty/general
        // chat when no brand resolves.
        if (!res.ok) {
          const msg = (await res.json().catch(() => null))?.error;
          if (msg) setError(msg);
        }

        const attach = searchParams.get('attach');
        const target = attach
          ? `/admin/strategy-lab?attach=${encodeURIComponent(attach)}`
          : '/admin/strategy-lab';
        router.replace(target);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Network error');
        // Still forward — better a general chat than a stuck spinner.
        router.replace('/admin/strategy-lab');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId, router, searchParams]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-sm text-text-muted">
        <Loader2 size={20} className="animate-spin" aria-hidden />
        <p>Loading Strategy Lab…</p>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
