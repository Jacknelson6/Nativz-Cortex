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
  /** The brand the current user is working on. `null` if none selected. */
  brand: AdminBrand | null;
  /** All brands the current user can switch to. */
  availableBrands: AdminBrand[];
  /** Switch to a brand by id, or pass `null` to clear the selection. */
  setBrand: (brandId: string | null) => void;
  /** True while a setBrand() call is round-tripping to the server. */
  isPending: boolean;
  /** Whether the current user is admin or viewer — drives switcher endpoint. */
  role: 'admin' | 'viewer';
}

const ActiveBrandContext = createContext<ActiveBrandContextValue | null>(null);

export function ActiveBrandProvider({
  children,
  initialBrand,
  availableBrands,
  role = 'admin',
}: {
  children: ReactNode;
  initialBrand: AdminBrand | null;
  availableBrands: AdminBrand[];
  /** Admin uses /api/admin/active-client; viewer uses /api/portal/brands/switch. */
  role?: 'admin' | 'viewer';
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
          const endpoint =
            role === 'viewer' ? '/api/portal/brands/switch' : '/api/admin/active-client';
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: brandId }),
          });
          if (!res.ok) {
            setOptimisticBrand(initialBrand);
          }
        } catch {
          setOptimisticBrand(initialBrand);
        } finally {
          router.refresh();
        }
      });
    },
    [availableBrands, initialBrand, router, role],
  );

  const value = useMemo<ActiveBrandContextValue>(
    () => ({ brand: optimisticBrand, availableBrands, setBrand, isPending, role }),
    [optimisticBrand, availableBrands, setBrand, isPending, role],
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
