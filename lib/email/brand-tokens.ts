/**
 * Shared email brand tokens (layout + transactional templates).
 *
 * Mirrors the canonical Trevor-designed shell from the docs repos:
 *   - Anderson-Collaborative/ac-docs (functions/_lib/forms.ts AC_EMAIL)
 *   - andersoncollab/nativz-docs    (functions/_lib/agreement.ts shell)
 *
 * Design language: light page background, white rounded card, dark gradient
 * header strip with logo + eyebrow + title, accent stripe along the bottom of
 * the header, light body, accent CTA with dark text.
 *
 * Both Nativz and AC share the same shell layout: only the gradient stops,
 * accent color, logo, font and footer copy differ.
 *
 * The exported `EmailBrand` keeps both new field names (pageBg, cardBg,
 * accent, ...) and legacy names (bgDark, bgCard, blue, ...) so older
 * templates continue to type-check; both names point at the same light-theme
 * colors so legacy templates inherit the new look automatically.
 */

import type { AgencyBrand } from '@/lib/agency/detect';

export type EmailBrand = {
  // Trevor shell tokens
  /** Page background behind the card. */
  readonly pageBg: string;
  /** Card surface (white in both brands). */
  readonly cardBg: string;
  /** Header gradient start (dark). */
  readonly headerGradStart: string;
  /** Header gradient end (dark, slightly lighter). */
  readonly headerGradEnd: string;
  /** Accent stripe along the bottom of the header. */
  readonly accent: string;
  /** Darker accent for footer links + button hover. */
  readonly accentDark: string;
  /** Soft accent surface for badges. */
  readonly accentSurface: string;
  /** Primary text (titles, strong). */
  readonly textPrimary: string;
  /** Body text inside the white card. */
  readonly textBody: string;
  /** Muted text (labels, address). */
  readonly textMuted: string;
  /** Hairline borders inside the card. */
  readonly border: string;
  /** Stats panel background. */
  readonly panelBg: string;
  /** CSS font stack. */
  readonly fontStack: string;
  /** Title font stack (used inside the dark header). */
  readonly titleFontStack: string;
  /** Title font weight inside the dark header. */
  readonly titleWeight: number;
  /** Title color inside the dark header (defaults to white). */
  readonly titleColor: string;
  /** Tagline shown under the card. */
  readonly tagline: string;
  /** Address shown under the tagline. */
  readonly address: string;
  /** Footer hyperlink target shown after the address. */
  readonly websiteUrl: string;
  /** Friendly brand name used in alt text + sender copy. */
  readonly brandName: string;

  // Legacy aliases. Templates written against the old dark-theme tokens still
  // type-check; the values now resolve to the new light-theme palette.
  readonly bgDark: string;
  readonly bgCard: string;
  readonly borderCard: string;
  readonly textFooter: string;
  readonly blue: string;
  readonly blueCta: string;
  readonly blueHover: string;
  readonly blueSurface: string;
};

function buildBrand(
  partial: Omit<
    EmailBrand,
    'bgDark' | 'bgCard' | 'borderCard' | 'textFooter' | 'blue' | 'blueCta' | 'blueHover' | 'blueSurface'
  >,
): EmailBrand {
  return {
    ...partial,
    bgDark: partial.pageBg,
    bgCard: partial.cardBg,
    borderCard: partial.border,
    textFooter: partial.textMuted,
    blue: partial.accent,
    blueCta: partial.accent,
    blueHover: partial.accentDark,
    blueSurface: partial.accentSurface,
  };
}

const NATIVZ_EMAIL: EmailBrand = buildBrand({
  pageBg: '#f4f6f9',
  cardBg: '#ffffff',
  headerGradStart: '#0A1628',
  headerGradEnd: '#0F1D32',
  accent: '#00ADEF',
  accentDark: '#0090CC',
  accentSurface: 'rgba(0, 173, 239, 0.10)',
  textPrimary: '#0A1628',
  textBody: '#3d4852',
  textMuted: '#7b8794',
  border: '#e8ecf0',
  panelBg: '#f7f9fb',
  fontStack:
    "'futura-pt', Futura, Jost, 'Century Gothic', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  titleFontStack:
    "'futura-pt', Futura, Jost, 'Century Gothic', system-ui, -apple-system, sans-serif",
  titleWeight: 700,
  titleColor: '#ffffff',
  tagline: 'Data-driven strategies. Creative execution. Real growth.',
  address: 'Nativz LLC, 3322 Shorecrest Drive Suite 225, Dallas TX 75235',
  websiteUrl: 'https://nativz.io',
  brandName: 'Nativz',
});

const AC_EMAIL: EmailBrand = buildBrand({
  pageBg: '#f4f6f9',
  cardBg: '#ffffff',
  headerGradStart: '#00161F',
  headerGradEnd: '#012029',
  accent: '#36D1C2',
  accentDark: '#2BB8AA',
  accentSurface: 'rgba(54, 209, 194, 0.10)',
  textPrimary: '#00161F',
  textBody: '#3d4852',
  textMuted: '#7b8794',
  border: '#e8ecf0',
  panelBg: '#f7f9fb',
  fontStack:
    "'Rubik', 'Roboto', system-ui, -apple-system, 'Segoe UI', sans-serif",
  titleFontStack:
    "'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  titleWeight: 300,
  titleColor: '#ffffff',
  tagline: 'Solving the marketing problems of today with the strategies of tomorrow.',
  address: 'Anderson Collaborative LLC, 4000 Ponce de Leon Blvd Ste 470, Coral Gables FL 33146',
  websiteUrl: 'https://andersoncollaborative.com',
  brandName: 'Anderson Collaborative',
});

export function getEmailBrand(agency: AgencyBrand): EmailBrand {
  return agency === 'anderson' ? AC_EMAIL : NATIVZ_EMAIL;
}

/** Legacy exports kept so existing imports keep type-checking. */
export const EMAIL_BRAND = NATIVZ_EMAIL;
export const AC_EMAIL_BRAND = AC_EMAIL;

const NATIVZ_MARKETING_LOGO_DEFAULT = 'https://cortex.nativz.io/nativz-logo.png';
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
