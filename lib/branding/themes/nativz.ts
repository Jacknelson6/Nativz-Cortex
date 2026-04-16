import type { AgencyTheme } from '../types';

/**
 * Nativz brand tokens.
 *
 * Values sourced from the live site (nativz.io) CSS and the existing
 * agency config. The primary `#046BD2` and dark `#01151D` are the
 * confirmed brand values — earlier `#6366F1` in `AGENCY_CONFIG` was wrong.
 */
export const nativzTheme: AgencyTheme = {
  slug: 'nativz',
  name: 'Nativz',
  shortName: 'Nativz',
  domain: 'https://nativz.io',
  supportEmail: 'hello@nativz.io',

  colors: {
    primary: '#046BD2',
    primaryHover: '#045CB4',
    primarySurface: 'rgba(4, 107, 210, 0.12)',

    dark: '#01151D',
    offwhite: '#F7F9FB',
    white: '#FFFFFF',

    textDark: '#0F1419',
    textBody: '#3D4852',
    textMuted: '#7B8794',

    border: '#E8ECF0',
    cardBg: '#F7F9FB',
  },

  fonts: {
    // Nativz site typography — Poppins is the primary brand sans, used
    // everywhere on nativz.io for both headings and body. Keeps the PDF
    // typographically consistent with the marketing site.
    heading: 'Poppins',
    body: 'Poppins',
    mono: 'Menlo',
  },

  logos: {
    svg: '/nativz-logo.svg',
    svgOnDark: '/nativz-logo.svg',
    // /nativz-logo.png is white-on-transparent (for dark backgrounds).
    // /nativz-logo-on-light.jpg is the dark-text variant flattened onto white
    // for maximum @react-pdf compatibility (its PNG decoder chokes on some
    // alpha-channel + metadata combinations).
    png: '/nativz-logo-on-light.jpg',
  },
};
