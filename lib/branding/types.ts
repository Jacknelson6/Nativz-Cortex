/**
 * Agency branding tokens — the single source of truth for any surface
 * that needs to render with a specific agency's look (PDFs, portal, emails,
 * branded shell). Import themes from `@/lib/branding` and swap by agency slug.
 */

export type AgencySlug = 'nativz' | 'anderson';

export interface AgencyTheme {
  /** Stable identifier — matches `detectAgencyFromHostname` output. */
  slug: AgencySlug;
  /** Display name — "Nativz", "Anderson Collaborative". */
  name: string;
  /** Short form for cramped spaces — "Nativz", "AC". */
  shortName: string;
  /** Marketing site. Used in email footers and branded doc hosts. */
  domain: string;
  /** Client-facing support address. */
  supportEmail: string;

  /** Raw color palette. Use sparingly in components — prefer theme tokens. */
  colors: {
    /** Primary accent — CTAs, labels, highlighted data. */
    primary: string;
    /** Slightly darker primary for hover states. */
    primaryHover: string;
    /** Soft background variant of the primary (e.g. tint for callouts). */
    primarySurface: string;

    /** Deep brand color — dark headers, CTAs on light, cover backgrounds. */
    dark: string;
    /** Cream / soft background alternative to pure white. */
    offwhite: string;
    /** Pure white — unmodified. */
    white: string;

    /** Body text stack — from strongest to weakest. */
    textDark: string;
    textBody: string;
    textMuted: string;

    /** Neutral card / divider palette. */
    border: string;
    cardBg: string;
  };

  /** Typography. Same family names work in web + react-pdf when registered. */
  fonts: {
    heading: string;
    body: string;
    /** Monospace for code / data. */
    mono: string;
  };

  /** Logo asset paths. PNGs carry pre-encoded base64 for PDF use. */
  logos: {
    /** Primary SVG — full-color, works on light backgrounds. */
    svg: string;
    /** SVG variant for dark backgrounds (usually inverted / knocked out). */
    svgOnDark: string;
    /** Raster fallback — path served from /public. */
    png: string;
    /** Base64-encoded PNG for react-pdf <Image src={...}>. */
    pngBase64: string;
  };
}
