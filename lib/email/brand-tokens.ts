/**
 * Shared email brand tokens (layout + transactional templates).
 * Supports Nativz (dark theme) and Anderson Collaborative (light theme).
 */

import type { AgencyBrand } from '@/lib/agency/detect';

export const EMAIL_BRAND = {
  bgDark: '#000C11',
  bgCard: '#01151D',
  borderCard: 'rgba(255,255,255,0.06)',
  textPrimary: '#FFFFFF',
  textBody: '#D1D5DB',
  textMuted: '#9CA3AF',
  textFooter: '#617792',
  blue: '#00AEEF',
  blueCta: '#046BD2',
  blueHover: '#045CB4',
  blueSurface: 'rgba(0,174,239,0.10)',
  fontStack: '"futura-pt", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Oxygen-Sans", Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
} as const;

export const AC_EMAIL_BRAND = {
  bgDark: '#F4F6F8',
  bgCard: '#FFFFFF',
  borderCard: '#D6DCE2',
  textPrimary: '#00161F',
  textBody: '#617792',
  textMuted: '#8A99A8',
  textFooter: '#617792',
  blue: '#36D1C2',
  blueCta: '#1A9E91',
  blueHover: '#178A7F',
  blueSurface: 'rgba(54, 209, 194, 0.10)',
  fontStack: '"futura-pt", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Oxygen-Sans", Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
} as const;

export type EmailBrand = {
  readonly bgDark: string;
  readonly bgCard: string;
  readonly borderCard: string;
  readonly textPrimary: string;
  readonly textBody: string;
  readonly textMuted: string;
  readonly textFooter: string;
  readonly blue: string;
  readonly blueCta: string;
  readonly blueHover: string;
  readonly blueSurface: string;
  readonly fontStack: string;
};

export function getEmailBrand(agency: AgencyBrand): EmailBrand {
  return agency === 'anderson' ? AC_EMAIL_BRAND : EMAIL_BRAND;
}

/** Nativz logo SVG (white text on transparent) — hosted on production for email rendering. */
const NATIVZ_MARKETING_LOGO_DEFAULT =
  'https://cortex.nativz.io/nativz-logo.svg';

/** Anderson Collaborative logo URL — override via EMAIL_AC_LOGO_URL env var.
 *  Uses the dark SVG logo (teal text on transparent) — correct for light-background emails. */
const AC_MARKETING_LOGO_DEFAULT =
  'https://cortex.andersoncollaborative.com/anderson-logo-dark.svg';

export function nativzEmailLogoUrl(): string {
  const custom = process.env.EMAIL_NATIVZ_LOGO_URL?.trim();
  if (custom) return custom;
  return NATIVZ_MARKETING_LOGO_DEFAULT;
}

export function acEmailLogoUrl(): string {
  const custom = process.env.EMAIL_AC_LOGO_URL?.trim();
  if (custom) return custom;
  return AC_MARKETING_LOGO_DEFAULT;
}

export function getEmailLogoUrl(agency: AgencyBrand): string {
  return agency === 'anderson' ? acEmailLogoUrl() : nativzEmailLogoUrl();
}
