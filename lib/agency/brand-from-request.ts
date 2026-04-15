import type { NextRequest } from 'next/server';
import { detectAgencyFromHostname, AGENCY_CONFIG, type AgencyBrand } from './detect';

/**
 * Detect the active agency brand from an incoming Next.js request. Checks
 * (in order):
 *   1. Middleware's `x-agency` header (set on every non-API response, but
 *      not on the request that reaches API routes)
 *   2. The request's hostname via `detectAgencyFromHostname`
 *
 * Returns brand + display name so system prompts, emails, and any other
 * server-side copy can swap agency references without hardcoding strings.
 *
 * Use this for AI system prompts so a user on the AC domain is told they
 * live inside "Anderson Collaborative Cortex" — if they ask who the agency
 * is, the model answers correctly instead of leaking the other brand.
 */
export function getBrandFromRequest(request: NextRequest | Request): {
  brand: AgencyBrand;
  brandName: string;
  shortName: string;
  domain: string;
} {
  const headerAgency = request.headers.get('x-agency');
  let brand: AgencyBrand;
  if (headerAgency === 'nativz' || headerAgency === 'anderson') {
    brand = headerAgency;
  } else {
    const hostHeader = request.headers.get('host') ?? '';
    let hostname = hostHeader;
    try {
      hostname = new URL(request.url).hostname || hostHeader;
    } catch {
      /* fall through to host header */
    }
    brand = detectAgencyFromHostname(hostname);
  }
  const config = AGENCY_CONFIG[brand];
  return {
    brand,
    brandName: config.name,
    shortName: config.shortName,
    domain: config.domain,
  };
}
