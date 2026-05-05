import type { AgencyBrand } from '@/lib/agency/detect';

/**
 * Resolve the Cortex app origin for a given agency brand. Used when we need
 * to mint a link that a recipient will click in a branded email, if the
 * email is themed for Anderson Collaborative, the link must live on the AC
 * host (cortex.andersoncollaborative.com) so the portal experience matches.
 *
 * Order of precedence:
 *   1. Per-agency env override (CORTEX_NATIVZ_URL / CORTEX_ANDERSON_URL)
 *   2. In non-production, NEXT_PUBLIC_APP_URL so dev share links open
 *      against the local Cortex instead of jumping to a prod host
 *   3. Hard-coded production hostnames (below)
 *
 * Production never falls back to NEXT_PUBLIC_APP_URL, that env is a single
 * value and would always bias toward one brand, which is exactly the bug
 * this helper exists to fix.
 */
export function getCortexAppUrl(agency: AgencyBrand): string {
  if (agency === 'anderson') {
    const override = process.env.CORTEX_ANDERSON_URL?.trim();
    if (override) return override;
    if (process.env.NODE_ENV !== 'production') {
      const dev = process.env.NEXT_PUBLIC_APP_URL?.trim();
      if (dev) return dev;
    }
    return 'https://cortex.andersoncollaborative.com';
  }
  const override = process.env.CORTEX_NATIVZ_URL?.trim();
  if (override) return override;
  if (process.env.NODE_ENV !== 'production') {
    const dev = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (dev) return dev;
  }
  return 'https://cortex.nativz.io';
}
