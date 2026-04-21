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

/**
 * Holds only the *current* working brand — no available-brands list. The
 * /admin/select-brand page fetches the client roster on demand when the
 * user wants to switch, so the admin layout doesn't pay the roster query
 * cost on every request.
 */
interface ActiveBrandContextValue {
  /** The brand the current admin is working on. `null` if none selected. */
  brand: AdminBrand | null;
  /** Switch to a brand by id, or pass `null` to clear the selection. */
  setBrand: (brandId: string | null) => void;
  /** True while a setBrand() call is round-tripping to the server. */
  isPending: boolean;
}

const ActiveBrandContext = createContext<ActiveBrandContextValue | null>(null);

export function ActiveBrandProvider({
  children,
  initialBrand,
}: {
  children: ReactNode;
  initialBrand: AdminBrand | null;
}) {
  const router = useRouter();
  // Optimistic — the UI pill swaps instantly while the server action flies.
  // On server rejection the subsequent router.refresh() re-seeds from the
  // cookie source of truth.
  const [optimisticBrand, setOptimisticBrand] = useState<AdminBrand | null>(initialBrand);
  const [isPending, startTransition] = useTransition();

  const setBrand = useCallback(
    (brandId: string | null) => {
      // Can't build a PortfolioClient object from just an id — clear the
      // optimistic brand so the pill shows "Select a brand" until the
      // server-seeded refresh lands. Keeps the UI honest if the server
      // 403s the switch.
      if (brandId === null) {
        setOptimisticBrand(null);
      }

      startTransition(async () => {
        try {
          const res = await fetch('/api/admin/active-client', {
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
    [initialBrand, router],
  );

  const value = useMemo<ActiveBrandContextValue>(
    () => ({ brand: optimisticBrand, setBrand, isPending }),
    [optimisticBrand, setBrand, isPending],
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
