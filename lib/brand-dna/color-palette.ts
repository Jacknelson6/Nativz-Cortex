import { JSDOM } from 'jsdom';
import type { CrawledPage } from './types';
import type { BrandColor } from '@/lib/knowledge/types';

const MAX_PALETTE_COLORS = 5;
const MERGE_DISTANCE_RGB = 40;

// ---------------------------------------------------------------------------
// CSS → hex
// ---------------------------------------------------------------------------

/** Parse a CSS color value to hex. Returns null for invalid/transparent values. */
export function cssColorToHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v || v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'currentcolor') return null;

  if (/^#[0-9a-f]{3,8}$/i.test(v)) {
    if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    return v.slice(0, 7);
  }

  const rgbMatch = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return rgbToHex(Number(r), Number(g), Number(b));
  }

  const hslMatch = v.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (hslMatch) {
    const [, h, s, l] = hslMatch;
    const [r, g, b] = hslToRgb(Number(h), Number(s), Number(l));
    return rgbToHex(r, g, b);
  }

  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return L - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

// ---------------------------------------------------------------------------
// Color math (RGB + HSL)
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length < 6) {
    return { r: 0, g: 0, b: 0 };
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return {
    r: Number.isFinite(r) ? r : 0,
    g: Number.isFinite(g) ? g : 0,
    b: Number.isFinite(b) ? b : 0,
  };
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d < 1e-6 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

function colorDistance(hex1: string, hex2: string): number {
  const u = hex1.trim().toLowerCase();
  const v = hex2.trim().toLowerCase();
  if (u === v) return 0;
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  const d = Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  // Invalid / malformed hex can yield NaN; never return NaN (breaks cluster merge thresholds).
  return Number.isFinite(d) ? d : 1e12;
}

/** Near white/black — drop from chromatic candidates. */
function isExtremeBrightness(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  const brightness = (r + g + b) / 3;
  return brightness > 248 || brightness < 8;
}

/** Low saturation mid-tones = generic UI gray, not a brand accent. */
function isGrayish(hex: string): boolean {
  const { s, l } = hexToHsl(hex);
  if (isExtremeBrightness(hex)) return true;
  return s < 14 && l > 12 && l < 94;
}

function chromaScore(hex: string): number {
  const { s } = hexToHsl(hex);
  return s / 100;
}

function hueCircularDiffDeg(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

function nameColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const brightness = (r + g + b) / 3;
  if (brightness > 200) return 'Light';
  if (brightness < 50) return 'Dark';
  if (r > g && r > b) return r > 200 ? 'Red' : 'Dark red';
  if (g > r && g > b) return g > 200 ? 'Green' : 'Dark green';
  if (b > r && b > g) return b > 200 ? 'Blue' : 'Dark blue';
  if (r > 200 && g > 150) return 'Orange';
  if (r > 200 && g > 200) return 'Yellow';
  if (r > 150 && b > 150) return 'Purple';
  return 'Brand color';
}

// ---------------------------------------------------------------------------
// Weighted collection
// ---------------------------------------------------------------------------

function weightForCssVarName(varName: string): number {
  const n = varName.toLowerCase();
  if (/(^|-)(primary|brand)(-|$)/.test(n)) return 22;
  if (/(^|-)(accent|cta|action|highlight|link)(-|$)/.test(n)) return 18;
  if (/(^|-)(secondary|supporting)(-|$)/.test(n)) return 14;
  if (/(^|-)(tertiary|muted|subtle|surface|foreground|background)(-|$)/.test(n)) return 8;
  if (/(color|bg|accent|theme)/.test(n)) return 10;
  return 6;
}

function addScore(map: Map<string, number>, hex: string | null, weight: number): void {
  if (!hex || isExtremeBrightness(hex)) return;
  map.set(hex, (map.get(hex) ?? 0) + weight);
}

/**
 * Extract color palette from CSS with source-aware scoring.
 * Caps output, merges near-duplicates, assigns primary / secondary / accent / tertiary / neutral.
 */
export function extractColorPalette(pages: CrawledPage[]): BrandColor[] {
  const scores = new Map<string, number>();

  for (const page of pages) {
    const dom = new JSDOM(page.html, { url: page.url });
    const doc = dom.window.document;

    const styleBlocks: string[] = [];
    doc.querySelectorAll('style').forEach((el) => styleBlocks.push(el.textContent ?? ''));
    doc.querySelectorAll('[style]').forEach((el) => styleBlocks.push(el.getAttribute('style') ?? ''));
    const cssText = styleBlocks.join('\n');

    const varDecl = cssText.matchAll(/--([\w-]+)\s*:\s*([^;}\n]+)/gi);
    for (const m of varDecl) {
      const varName = m[1];
      const raw = m[2];
      if (
        !/(color|bg|accent|primary|secondary|brand|theme|foreground|background|surface|cta|link|muted|ring|chart|card|popover|destructive|sidebar)/i.test(
          varName,
        )
      ) {
        continue;
      }
      const hex = cssColorToHex(raw.split(/[,\s]/)[0] ?? raw);
      if (!hex) continue;
      const w = weightForCssVarName(varName);
      addScore(scores, hex, w);
    }

    const declMatches = [
      ...cssText.matchAll(/(background(?:-color)?|color|border-color|fill|stroke)\s*:\s*([^;}\n]+)/gi),
    ];
    for (const dm of declMatches) {
      const prop = dm[1].toLowerCase();
      const raw = dm[2].trim();
      const hex = cssColorToHex(raw.split(/[,\s]/)[0] ?? raw);
      if (!hex || isGrayish(hex)) continue;
      let w = 2;
      if (prop === 'background' || prop === 'background-color') w = 4;
      if (prop === 'color') w = 3;
      if (prop === 'border-color') w = 1;
      addScore(scores, hex, w);
    }

    const themeColor = doc.querySelector('meta[name="theme-color"]')?.getAttribute('content');
    addScore(scores, cssColorToHex(themeColor ?? ''), 26);

    const msTile = doc.querySelector('meta[name="msapplication-TileColor"]')?.getAttribute('content');
    addScore(scores, cssColorToHex(msTile ?? ''), 12);

    let hexHits = 0;
    const hexNearProp = cssText.matchAll(
      /(?:color|background|border|fill|stroke)[^#]{0,40}(#[0-9a-fA-F]{3,8}\b)/gi,
    );
    for (const m of hexNearProp) {
      if (hexHits >= 24) break;
      const hex = cssColorToHex(m[1]);
      if (hex && !isGrayish(hex)) {
        addScore(scores, hex, 1.5);
        hexHits++;
      }
    }
  }

  const sorted = [...scores.entries()]
    .map(([hex, score]) => ({ hex, score }))
    .sort((a, b) => b.score - a.score);

  const merged = mergeByRepresentative(sorted);
  return assignSemanticRoles(merged);
}

function mergeByRepresentative(sorted: { hex: string; score: number }[]): { hex: string; score: number }[] {
  const out: { hex: string; score: number }[] = [];
  const used = new Set<string>();

  for (const c of sorted) {
    if (used.has(c.hex)) continue;
    const cluster: { hex: string; score: number }[] = [];
    for (const other of sorted) {
      if (used.has(other.hex)) continue;
      if (colorDistance(c.hex, other.hex) < MERGE_DISTANCE_RGB) {
        cluster.push(other);
      }
    }
    // Invalid hex can yield NaN distance so c never joins — still need a cluster.
    if (cluster.length === 0) cluster.push(c);
    for (const x of cluster) used.add(x.hex);
    const seed = cluster[0]!;
    const rep = cluster.reduce((a, b) => (b.score > a.score ? b : a), seed).hex;
    const total = cluster.reduce((s, x) => s + x.score, 0);
    out.push({ hex: rep, score: total });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

function assignSemanticRoles(merged: { hex: string; score: number }[]): BrandColor[] {
  if (merged.length === 0) return [];

  const chromatic = merged.filter((c) => !isGrayish(c.hex));
  const neutrals = merged.filter((c) => isGrayish(c.hex));

  if (chromatic.length === 0) {
    return neutrals.slice(0, Math.min(2, MAX_PALETTE_COLORS)).map((c, i) => ({
      hex: c.hex,
      name: nameColor(c.hex),
      role: (i === 0 ? 'neutral' : 'secondary') as BrandColor['role'],
    }));
  }

  const picks: { hex: string; score: number }[] = [];
  const taken = new Set<string>();

  const pushUnique = (c: { hex: string; score: number } | undefined) => {
    if (!c || taken.has(c.hex)) return;
    taken.add(c.hex);
    picks.push(c);
  };

  pushUnique(chromatic[0]);

  const restChromatic = chromatic.slice(1);
  if (restChromatic.length > 0) {
    const primaryHex = picks[0]!.hex;
    const h0 = hexToHsl(primaryHex).h;
    let best = restChromatic[0]!;
    let bestSpread = -1;
    for (const c of restChromatic) {
      const dh = hueCircularDiffDeg(h0, hexToHsl(c.hex).h);
      const spread = (dh / 180) * Math.sqrt(c.score);
      if (spread > bestSpread) {
        bestSpread = spread;
        best = c;
      }
    }
    pushUnique(best);
  }

  const pool = chromatic.filter((c) => !taken.has(c.hex));
  if (pool.length > 0) {
    const accentPick = pool.reduce(
      (a, b) =>
        chromaScore(a.hex) * a.score >= chromaScore(b.hex) * b.score ? a : b,
      pool[0],
    );
    pushUnique(accentPick);
  }

  const pool2 = chromatic.filter((c) => !taken.has(c.hex));
  if (pool2.length > 0) {
    pool2.sort((a, b) => b.score - a.score);
    pushUnique(pool2[0]);
  }

  if (picks.length < MAX_PALETTE_COLORS && neutrals.length > 0) {
    const n = neutrals.find((c) => !taken.has(c.hex));
    pushUnique(n);
  }

  const roles: BrandColor['role'][] = ['primary', 'secondary', 'accent', 'tertiary', 'neutral'];
  const out: BrandColor[] = [];
  for (let i = 0; i < picks.length && i < MAX_PALETTE_COLORS; i++) {
    const c = picks[i]!;
    let role: BrandColor['role'] = roles[i] ?? 'accent';
    if (role === 'neutral' && !isGrayish(c.hex)) {
      role = 'tertiary';
    }
    out.push({ hex: c.hex, name: nameColor(c.hex), role });
  }

  return out;
}

/**
 * Dedupe hex strings for lightweight scrapers (string[] only).
 * Merges similar colors and caps list length.
 */
export function dedupeHexList(hexes: string[], max = 6): string[] {
  const scored = hexes
    .map((h) => ({ hex: cssColorToHex(h) ?? h.toLowerCase(), score: 1 }))
    .filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex) && !isExtremeBrightness(c.hex));
  const merged = mergeByRepresentative(scored.sort((a, b) => b.score - a.score));
  return merged.slice(0, max).map((c) => c.hex);
}
