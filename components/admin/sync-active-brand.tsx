'use client';

import { useEffect } from 'react';
import { useActiveBrand } from '@/lib/admin/active-client-context';

/**
 * Mount-time sync: if the page this component lives on was deep-linked with
 * a specific `clientId` in its URL (e.g. `/admin/strategy-lab/<uuid>`),
 * push that brand into the active-brand context so the top-bar pill stays
 * in lockstep with the page's data.
 *
 * Cheap — fires only when the URL's clientId differs from the current
 * context brand. On a normal navigation (user picked the brand via
 * /admin/select-brand, then clicked Strategy Lab), the ids already match
 * and this is a no-op.
 *
 * Trusts the server to reject bogus ids — `setBrand` POSTs to the
 * `/api/admin/active-client` endpoint which re-authorizes on every call.
 */
export function SyncActiveBrand({ clientId }: { clientId: string | null | undefined }) {
  const { brand, setBrand } = useActiveBrand();

  useEffect(() => {
    if (!clientId) return;
    if (brand?.id === clientId) return;
    setBrand(clientId);
  }, [clientId, brand?.id, setBrand]);

  return null;
}
