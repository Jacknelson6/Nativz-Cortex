'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { AdminBrand } from '@/lib/admin/get-active-client';

interface ActiveBrandContextValue {
  /** The brand the current admin is working on. `null` if none selected. */
  brand: AdminBrand | null;
  /** All brands the current admin can switch to. */
  availableBrands: AdminBrand[];
  /** Switch to a brand by id, or pass `null` to clear the selection. */
  setBrand: (brandId: string | null) => void;
  /** True while a setBrand() call is round-tripping to the server. */
  isPending: boolean;
}

const ActiveBrandContext = createContext<ActiveBrandContextValue | null>(null);

export function ActiveBrandProvider({
  children,
  initialBrand,
  availableBrands,
}: {
  children: ReactNode;
  initialBrand: AdminBrand | null;
  availableBrands: AdminBrand[];
}) {
  const router = useRouter();
  // Optimistic — the UI pill swaps instantly while the server action flies.
  // If the server rejects (403 for an unreachable brand), the subsequent
  // router.refresh() will re-seed from the source of truth.
  const [optimisticBrand, setOptimisticBrand] = useState<AdminBrand | null>(initialBrand);
  const [isPending, startTransition] = useTransition();

  const setBrand = useCallback(
    (brandId: string | null) => {
      const next = brandId ? availableBrands.find((b) => b.id === brandId) ?? null : null;
      setOptimisticBrand(next);

      startTransition(async () => {
        try {
          const res = await fetch('/api/admin/active-client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: brandId }),
          });
          if (!res.ok) {
            // Rollback — server rejected. Refresh reseeds from cookie/db.
            setOptimisticBrand(initialBrand);
          }
        } catch {
          setOptimisticBrand(initialBrand);
        } finally {
          // Re-render server components (layouts, pages) so route-param tools
          // that read the cookie pick up the new brand without a full reload.
          router.refresh();
        }
      });
    },
    [availableBrands, initialBrand, router],
  );

  const value = useMemo<ActiveBrandContextValue>(
    () => ({ brand: optimisticBrand, availableBrands, setBrand, isPending }),
    [optimisticBrand, availableBrands, setBrand, isPending],
  );

  return <ActiveBrandContext.Provider value={value}>{children}</ActiveBrandContext.Provider>;
}

/**
 * Read the current admin's active working brand + switcher API.
 * Throws if called outside an `<ActiveBrandProvider />` so misuse surfaces
 * at dev time rather than as silent `undefined` bugs.
 */
export function useActiveBrand(): ActiveBrandContextValue {
  const ctx = useContext(ActiveBrandContext);
  if (!ctx) {
    throw new Error(
      'useActiveBrand must be used inside <ActiveBrandProvider /> (admin layout).',
    );
  }
  return ctx;
}
