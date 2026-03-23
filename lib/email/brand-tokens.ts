/**
 * Shared Nativz email chrome (layout + transactional templates).
 */

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

/** Raster logo from www.nativz.io (opaque white canvas — paired with white header panel in layout). */
const NATIVZ_MARKETING_LOGO_DEFAULT =
  'https://nativz.io/wp-content/uploads/2022/12/nativz-logo-square-scaled.jpg';

export function nativzEmailLogoUrl(): string {
  const custom = process.env.EMAIL_NATIVZ_LOGO_URL?.trim();
  if (custom) return custom;
  return NATIVZ_MARKETING_LOGO_DEFAULT;
}
