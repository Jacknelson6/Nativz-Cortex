// ---------------------------------------------------------------------------
// Ad Creatives v2 — CCC Palette Helper
// ---------------------------------------------------------------------------
//
// Resolves a palette key OR a raw background name (e.g. "cream", "charcoal",
// "red") to a hex string. Layouts call getHex() rather than reading
// palette[key] directly so fallbacks stay co-located.

import type { BrandRenderContext } from "../../types";

/** Built-in fallback hexes for common background names. */
const BG_FALLBACKS: Record<string, string> = {
  cream: "#E8DBB7",
  ivory: "#F5F1E8",
  charcoal: "#1F1F1F",
  red: "#CE2C2C",
  burgundy: "#7E1A1A",
  white: "#FFFFFF",
  muted: "#8A7B60",
  onPrimary: "#FFFFFF",
  primary: "#0B1E3F",
};

export function getHex(
  brand: BrandRenderContext,
  key: string,
  opts: { fallback?: string } = {},
): string {
  const palette = brand.palette as Record<string, string | undefined>;
  return palette[key] ?? BG_FALLBACKS[key] ?? opts.fallback ?? "#000000";
}
