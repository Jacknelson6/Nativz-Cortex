/**
 * WCAG 2.0 contrast helpers for compositor text / CTA (see PRD).
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace(/^#/, '').trim();
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

/** WCAG 2.0 relative luminance for sRGB hex. */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = [rgb.r, rgb.g, rgb.b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two sRGB colors (1–21). */
export function contrastRatio(hex1: string, hex2: string): number {
  const L1 = relativeLuminance(hex1);
  const L2 = relativeLuminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick white or black for best contrast on `backgroundHex`. */
export function bestTextColor(backgroundHex: string): '#FFFFFF' | '#000000' {
  const white = contrastRatio(backgroundHex, '#FFFFFF');
  const black = contrastRatio(backgroundHex, '#000000');
  return white >= black ? '#FFFFFF' : '#000000';
}

/** Subtle shadow for text over photos (CSS-like value for satori). */
export function textShadowForOverlay(textColor: string): string {
  const dark = relativeLuminance(textColor) < 0.5;
  return dark
    ? '0 1px 2px rgba(255,255,255,0.25)'
    : '0 1px 3px rgba(0,0,0,0.65)';
}
