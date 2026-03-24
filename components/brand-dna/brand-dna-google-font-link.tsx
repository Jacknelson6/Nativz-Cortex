'use client';

import { useEffect } from 'react';

/**
 * Builds a Google Fonts CSS2 URL for browser rendering (WOFF2). Used by Brand DNA previews.
 */
export function brandDnaGoogleFontsStylesheetHref(families: string[]): string | null {
  const uniq = [...new Set(families.map((f) => f.trim()).filter(Boolean))];
  if (uniq.length === 0) return null;
  const params = uniq
    .map((family) => `family=${encodeURIComponent(family)}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/**
 * Injects a stylesheet link once per unique href so Typography cards render with real webfonts.
 */
export function BrandDnaGoogleFontLink({ families }: { families: string[] }) {
  const href = brandDnaGoogleFontsStylesheetHref(families);

  useEffect(() => {
    if (!href) return;
    for (const el of document.querySelectorAll('link[rel="stylesheet"]')) {
      if (el.getAttribute('href') === href) return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }, [href]);

  return null;
}
