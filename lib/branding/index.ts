/**
 * Agency branding registry. The single source of truth for per-agency
 * tokens used by PDFs, emails, branded shells, and anywhere else that
 * varies by agency.
 *
 * Usage:
 *   import { getTheme, type AgencyTheme } from '@/lib/branding';
 *   const theme = getTheme('nativz');
 *
 * For hostname-based resolution, use `detectAgencyFromHostname` from
 * `@/lib/agency/detect` and pass its result here.
 */

import { nativzTheme } from './themes/nativz';
import { andersonTheme } from './themes/anderson';
import type { AgencySlug, AgencyTheme } from './types';

export type { AgencySlug, AgencyTheme } from './types';

const REGISTRY: Record<AgencySlug, AgencyTheme> = {
  nativz: nativzTheme,
  anderson: andersonTheme,
};

/** Look up a theme by agency slug. Defaults to nativz on unknown input. */
export function getTheme(slug: AgencySlug | string | null | undefined): AgencyTheme {
  if (slug === 'anderson') return andersonTheme;
  return nativzTheme;
}

/** All themes as a list — useful for admin UIs that enumerate brands. */
export const allThemes: AgencyTheme[] = [nativzTheme, andersonTheme];

export { nativzTheme, andersonTheme };
