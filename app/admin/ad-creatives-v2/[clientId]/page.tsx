'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Legacy `/admin/ad-creatives-v2/[clientId]` route. Ad Creatives had its
 * URL flattened to just `/admin/ad-creatives` — the session brand pill
 * now drives which client's workspace renders. This shim seeds the
 * `x-admin-active-client` cookie from the URL's clientId then
 * router.replace()-es to the flat URL. Matches the legacy shim pattern
 * used by Strategy Lab.
 */
export default function LegacyAdCreativesClientRedirect({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = use(params);
  const router = useRouter();
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
        if (!res.ok) {
          const msg = (await res.json().catch(() => null))?.error;
          if (msg) setError(msg);
        }
        router.replace('/admin/ad-creatives');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Network error');
        router.replace('/admin/ad-creatives');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, router]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-sm text-text-muted">
        <Loader2 size={20} className="animate-spin" aria-hidden />
        <p>Loading Ad Creatives…</p>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
