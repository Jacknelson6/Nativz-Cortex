'use client';

import { useEffect } from 'react';
import { useActiveBrand } from '@/lib/admin/active-client-context';

/**
 * Mount-time sync: if the page this component lives on was deep-linked with a
 * specific `clientId` in its URL (e.g. `/admin/strategy-lab/<uuid>`), push
 * that brand into the active-brand context so the top-bar pill stays in
 * lockstep with the page's data.
 *
 * Cheap — fires only when the URL's clientId differs from the current
 * context brand. On a normal navigation (user picked the brand in the pill,
 * then clicked Strategy Lab), the ids already match and this is a no-op.
 */
export function SyncActiveBrand({ clientId }: { clientId: string | null | undefined }) {
  const { brand, availableBrands, setBrand } = useActiveBrand();

  useEffect(() => {
    if (!clientId) return;
    if (brand?.id === clientId) return;
    // Only sync to brands the current admin can actually see — guards
    // against a URL pointing to a brand the user doesn't have access to
    // (setBrand would no-op silently, but we save the wasted round-trip).
    if (!availableBrands.some((b) => b.id === clientId)) return;
    setBrand(clientId);
  }, [clientId, brand?.id, availableBrands, setBrand]);

  return null;
}
