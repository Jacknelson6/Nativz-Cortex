'use client';

import { useMemo } from 'react';
import { AGENCY_CONFIG, type AgencyBrand } from './detect';

/**
 * Client-side brand detection from hostname.
 * Use in 'use client' pages that don't have access to the BrandModeProvider
 * (e.g. shared public pages).
 *
 * For server-side code, import `getBrandFromAgency` from `./detect` directly —
 * this file is `'use client'` so any export gets RSC-wrapped and can't be
 * invoked from the server.
 */
export function useAgencyBrand(): {
  brand: AgencyBrand;
  brandName: string;
  config: (typeof AGENCY_CONFIG)[AgencyBrand];
} {
  return useMemo(() => {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isAC = hostname.includes('andersoncollaborative');
    const brand: AgencyBrand = isAC ? 'anderson' : 'nativz';
    return {
      brand,
      brandName: AGENCY_CONFIG[brand].name,
      config: AGENCY_CONFIG[brand],
    };
  }, []);
}
