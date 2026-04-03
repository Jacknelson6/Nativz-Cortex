/**
 * Agency detection from request hostname.
 * Single source of truth for domain → brand mapping.
 */

export type AgencyBrand = 'nativz' | 'anderson';

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
 * Agency config for branding.
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
    name: 'Nativz',
    shortName: 'Nativz',
    domain: 'https://nativz.io',
    logoPath: '/nativz-logo.svg',
    logoDarkPath: '/nativz-logo.svg',
    supportEmail: 'hello@nativz.io',
    primaryColor: '#6366F1',
  },
  anderson: {
    name: 'Anderson Collaborative',
    shortName: 'AC',
    domain: 'https://andersoncollaborative.com',
    logoPath: '/anderson-logo.svg',
    logoDarkPath: '/anderson-logo-dark.svg',
    supportEmail: 'hello@andersoncollaborative.com',
    primaryColor: '#0EA5E9',
  },
};
