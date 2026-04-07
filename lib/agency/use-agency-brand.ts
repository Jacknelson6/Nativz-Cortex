'use client';

import { useMemo } from 'react';
import { AGENCY_CONFIG, type AgencyBrand } from './detect';

/**
 * Client-side brand detection from hostname.
 * Use in 'use client' pages that don't have access to the BrandModeProvider
 * (e.g. shared public pages).
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

/**
 * Detect brand from an agency string (e.g. client.agency field).
 * Falls back to 'nativz' if null/empty.
 */
export function getBrandFromAgency(agency: string | null | undefined): AgencyBrand {
  if (!agency) return 'nativz';
  const lower = agency.toLowerCase();
  if (lower.includes('anderson') || lower === 'ac') return 'anderson';
  return 'nativz';
}
