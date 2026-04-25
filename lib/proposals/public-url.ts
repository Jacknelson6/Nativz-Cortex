import type { AgencyBrand } from '@/lib/agency/detect';

/**
 * Build the canonical absolute URL where Cortex serves the public proposal
 * page for a given agency + slug. Used in:
 *   - emails to signers (Resend `Review and sign` button)
 *   - the canonical `proposalUrl` baked into the signed PDF
 *   - admin UI iframe preview
 *
 * Both agencies share the same Vercel deploy; the agency picks the host.
 */
export function publicProposalUrl(agency: AgencyBrand, slug: string): string {
  const host = agency === 'anderson'
    ? process.env.PROPOSALS_PUBLIC_HOST_ANDERSON ?? 'https://cortex.andersoncollaborative.com'
    : process.env.PROPOSALS_PUBLIC_HOST_NATIVZ ?? 'https://cortex.nativz.io';
  return `${host.replace(/\/+$/, '')}/proposals/${slug}`;
}
