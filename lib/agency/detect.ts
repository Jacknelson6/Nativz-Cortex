/**
 * Agency detection from request hostname.
 * Single source of truth for domain → brand mapping.
 *
 * Branding tokens (colors, fonts, logo base64) live in `@/lib/branding`.
 * This file is only about resolving which agency a request belongs to and
 * projecting the small slice of legacy fields existing callers still import.
 */

import { nativzTheme, andersonTheme } from '@/lib/branding';
import type { AgencySlug } from '@/lib/branding';

export type AgencyBrand = AgencySlug;

const AC_HOSTNAMES = [
  'cortex.andersoncollaborative.com',
  'andersoncollaborative.com',
  'anderson-collaborative',
  'anderson',
];

/**
 * Detect agency brand from a hostname string.
 * Returns 'anderson' for AC domains, 'nativz' for everything else.
 */
export function detectAgencyFromHostname(hostname: string): AgencyBrand {
  const lower = hostname.toLowerCase();
  if (AC_HOSTNAMES.some((h) => lower.includes(h))) return 'anderson';
  return 'nativz';
}

/**
 * Detect brand from an agency string (e.g. `clients.agency` column).
 *
 * Hard requirement (post-Victory incident): a client's agency MUST be
 * explicitly set at creation time. Silently defaulting to 'nativz' caused
 * Anderson Collaborative clients to receive Nativz-branded emails. Callers
 * that legitimately have no client context should pass an explicit agency
 * from the request hostname (`detectAgencyFromHostname`) instead.
 *
 * Behavior:
 *   - Known AC string → 'anderson'
 *   - Known Nativz string → 'nativz'
 *   - Null / empty / unknown → throws in dev, logs + returns 'nativz' in
 *     production (kept as a soft fallback so a malformed row can't 500 a
 *     whole request, but the log line is the alarm bell).
 */
export function getBrandFromAgency(agency: string | null | undefined): AgencyBrand {
  if (agency) {
    const lower = agency.toLowerCase();
    if (lower.includes('anderson') || lower === 'ac') return 'anderson';
    if (lower.includes('nativz') || lower === 'nz') return 'nativz';
  }
  const reason = !agency ? 'null/empty agency' : `unknown agency value: ${agency}`;
  const msg = `[agency] getBrandFromAgency called with ${reason}. Agency must be set at client creation.`;
  if (process.env.NODE_ENV === 'production') {
    console.error(msg);
    return 'nativz';
  }
  throw new Error(msg);
}

/**
 * Dev-mode override for local-only brand testing.
 * Reads `?brand=anderson|nativz` from the URL or `cortex_dev_brand` cookie,
 * applied ONLY when NODE_ENV !== 'production'. Production requests always
 * fall through to hostname detection.
 *
 * Use case: flip brand modes on localhost:3005 without needing a DNS alias.
 * Set via `?brand=anderson` once (also writes the cookie) and subsequent
 * requests stay in that brand until you flip back with `?brand=nativz`.
 */
export function resolveAgencyForRequest(request: {
  nextUrl: { hostname: string; searchParams: URLSearchParams };
  cookies: { get: (name: string) => { value: string } | undefined };
}): AgencyBrand {
  if (process.env.NODE_ENV !== 'production') {
    const query = request.nextUrl.searchParams.get('brand');
    if (query === 'anderson' || query === 'nativz') return query;
    const cookie = request.cookies.get('cortex_dev_brand')?.value;
    if (cookie === 'anderson' || cookie === 'nativz') return cookie;
  }
  return detectAgencyFromHostname(request.nextUrl.hostname);
}

/**
 * Legacy agency config — kept for existing callers. New code should import
 * the full theme from `@/lib/branding` via `getTheme(slug)` instead.
 */
export const AGENCY_CONFIG: Record<AgencyBrand, {
  name: string;
  shortName: string;
  domain: string;
  logoPath: string;
  logoDarkPath: string;
  supportEmail: string;
  primaryColor: string;
}> = {
  nativz: {
    name: nativzTheme.name,
    shortName: nativzTheme.shortName,
    domain: nativzTheme.domain,
    logoPath: nativzTheme.logos.svg,
    logoDarkPath: nativzTheme.logos.svgOnDark,
    supportEmail: nativzTheme.supportEmail,
    primaryColor: nativzTheme.colors.primary,
  },
  anderson: {
    name: andersonTheme.name,
    shortName: andersonTheme.shortName,
    domain: andersonTheme.domain,
    logoPath: andersonTheme.logos.svg,
    logoDarkPath: andersonTheme.logos.svgOnDark,
    supportEmail: andersonTheme.supportEmail,
    primaryColor: andersonTheme.colors.primary,
  },
};
