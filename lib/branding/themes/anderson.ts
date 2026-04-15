import type { AgencyTheme } from '../types';
import { AC_LOGO_PNG } from '@/lib/brand-logo';

/**
 * Anderson Collaborative brand tokens.
 *
 * Values sourced from the ac-docs repo (github.com/Anderson-Collaborative/ac-docs)
 * which is the canonical brand system for client-facing AC documents.
 */
export const andersonTheme: AgencyTheme = {
  slug: 'anderson',
  name: 'Anderson Collaborative',
  shortName: 'AC',
  domain: 'https://andersoncollaborative.com',
  supportEmail: 'hello@andersoncollaborative.com',

  colors: {
    primary: '#36D1C2',
    primaryHover: '#2BB8AA',
    primarySurface: 'rgba(54, 209, 194, 0.12)',

    dark: '#00161F',
    offwhite: '#FEF9F6',
    white: '#FFFFFF',

    textDark: '#0F1419',
    textBody: '#3D4852',
    textMuted: '#7B8794',

    border: '#E8ECF0',
    cardBg: '#F7F9FB',
  },

  fonts: {
    heading: 'Rubik',
    body: 'Roboto',
    mono: 'Menlo',
  },

  logos: {
    svg: '/anderson-logo.svg',
    svgOnDark: '/anderson-logo-dark.svg',
    png: '/anderson-logo.png',
    pngBase64: AC_LOGO_PNG,
  },
};
