import type { AgencyBrand } from '@/lib/agency/detect';

/**
 * Resolve the Cortex app origin for a given agency brand. Used when we need
 * to mint a link that a recipient will click in a branded email — if the
 * email is themed for Anderson Collaborative, the link must live on the AC
 * host (cortex.andersoncollaborative.com) so the portal experience matches.
 *
 * Order of precedence:
 *   1. Per-agency env override (CORTEX_NATIVZ_URL / CORTEX_ANDERSON_URL)
 *   2. Hard-coded production hostnames (below)
 *
 * `NEXT_PUBLIC_APP_URL` is intentionally NOT consulted here — it's a single
 * value and always biases toward one brand. This helper is specifically for
 * cross-brand flows (invite emails, digests) where we need to pick per-email.
 */
export function getCortexAppUrl(agency: AgencyBrand): string {
  if (agency === 'anderson') {
    return (
      process.env.CORTEX_ANDERSON_URL?.trim() ||
      'https://cortex.andersoncollaborative.com'
    );
  }
  return (
    process.env.CORTEX_NATIVZ_URL?.trim() ||
    'https://cortex.nativz.io'
  );
}
