// ---------------------------------------------------------------------------
// Ad Creatives v2 — Shared Layout Utilities
// ---------------------------------------------------------------------------
//
// Compositor primitives used by every layout renderer. Ported from
// morning-ads. Keep pure — no DB, no network.

import { type SKRSContext2D, type Image, loadImage } from "@napi-rs/canvas";
import type {
  BrandPalette,
  BrandRenderContext,
  HeadlineSpan,
  LogoAnchor,
} from "../types";

/** 1080×1080 is the Meta feed native canvas for v2. */
export const CANVAS_1080 = 1080;

export async function loadImageFromBuffer(buf: Buffer): Promise<Image> {
  return loadImage(buf);
}

export function drawCover(
  ctx: SKRSContext2D,
  img: { width: number; height: number },
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const srcRatio = img.width / img.height;
  const dstRatio = dw / dh;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (srcRatio > dstRatio) {
    sw = img.height * dstRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img as never, sx, sy, sw, sh, dx, dy, dw, dh);
}

export function fillSolid(
  ctx: SKRSContext2D,
  hex: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = hex;
  ctx.fillRect(x, y, w, h);
}

export function drawGoldRule(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  hex: string,
  thickness = 3,
): void {
  ctx.fillStyle = hex;
  ctx.fillRect(x, y, w, thickness);
}

export function drawLetterSpaced(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
): void {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
}

export function measureLetterSpaced(
  ctx: SKRSContext2D,
  text: string,
  spacing: number,
): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w - spacing;
}

// ---------------------------------------------------------------------------
// Headline word model + wrap
// ---------------------------------------------------------------------------

export type Word = {
  text: string;
  italic?: boolean;
  color?: keyof BrandPalette;
  forceBreakBefore?: boolean;
};

export function buildWords(spans: HeadlineSpan[] | string): Word[] {
  const arr = typeof spans === "string" ? [{ text: spans }] : spans;
  const words: Word[] = [];
  for (const s of arr) {
    const parts = s.text.split(/\s+/).filter(Boolean);
    parts.forEach((p, i) => {
      words.push({
        text: p,
        italic: s.italic,
        color: s.color,
        forceBreakBefore: i === 0 && s.newline === true,
      });
    });
  }
  return words;
}

export function wrapWords(
  ctx: SKRSContext2D,
  words: Word[],
  opts: { font: string; maxWidth: number },
): Word[][] {
  ctx.font = opts.font;
  const lines: Word[][] = [];
  let current: Word[] = [];
  let currentWidth = 0;
  const spaceWidth = ctx.measureText(" ").width;

  for (const word of words) {
    const wordWidth = ctx.measureText(word.text).width;
    const forceBreak = word.forceBreakBefore && current.length > 0;
    const needed =
      current.length === 0 ? wordWidth : currentWidth + spaceWidth + wordWidth;
    if (forceBreak || (needed > opts.maxWidth && current.length > 0)) {
      lines.push(current);
      current = [word];
      currentWidth = wordWidth;
    } else {
      current.push(word);
      currentWidth = needed;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

export function drawHeadlineLines(
  ctx: SKRSContext2D,
  lines: Word[][],
  opts: {
    x: number;
    yTop: number;
    fontBuilder: (italic: boolean) => string;
    lineHeight: number;
    fontSize: number;
    palette: BrandPalette;
    defaultColor: keyof BrandPalette;
    align?: "left" | "center" | "right";
    maxWidth?: number;
    canvasWidth: number;
  },
): void {
  const align = opts.align ?? "left";
  let y = opts.yTop + opts.fontSize;
  for (const line of lines) {
    ctx.textBaseline = "alphabetic";
    let totalWidth = 0;
    for (const w of line) {
      ctx.font = opts.fontBuilder(w.italic ?? false);
      totalWidth += ctx.measureText(w.text).width;
    }
    ctx.font = opts.fontBuilder(false);
    const spaceWidth = ctx.measureText(" ").width;
    totalWidth += spaceWidth * Math.max(0, line.length - 1);

    let cursorX = opts.x;
    if (align === "center" && opts.maxWidth) {
      cursorX = opts.x + (opts.maxWidth - totalWidth) / 2;
    } else if (align === "right" && opts.maxWidth) {
      cursorX = opts.x + opts.maxWidth - totalWidth;
    }

    for (let i = 0; i < line.length; i++) {
      const word = line[i];
      const colorKey = word.color ?? opts.defaultColor;
      const hex = opts.palette[colorKey] ?? opts.palette.onPrimary;
      ctx.fillStyle = hex!;
      ctx.font = opts.fontBuilder(word.italic ?? false);
      ctx.fillText(word.text, cursorX, y);
      cursorX += ctx.measureText(word.text).width;
      if (i < line.length - 1) cursorX += spaceWidth;
    }
    y += opts.fontSize * opts.lineHeight;
  }
}

// ---------------------------------------------------------------------------
// Logo compositor
// ---------------------------------------------------------------------------

export async function drawLogoAt(
  ctx: SKRSContext2D,
  brandCtx: BrandRenderContext,
  colorway: string,
  opts: {
    width: number;
    x: number;
    y: number;
    anchor?: LogoAnchor;
  },
): Promise<void> {
  const buf = brandCtx.logos[colorway];
  if (!buf) {
    throw new Error(
      `Logo colorway "${colorway}" not registered for ${brandCtx.clientName}. ` +
        `Available: ${Object.keys(brandCtx.logos).join(", ") || "<none>"}`,
    );
  }
  const img = await loadImage(buf);
  const ratio = img.width / img.height;
  const w = opts.width;
  const h = w / ratio;
  const anchor = opts.anchor ?? "top-left";
  let drawX = opts.x;
  let drawY = opts.y;
  if (anchor.endsWith("right")) drawX = opts.x - w;
  else if (anchor === "top-center" || anchor === "bottom-center" || anchor === "center")
    drawX = opts.x - w / 2;
  if (anchor.startsWith("bottom")) drawY = opts.y - h;
  else if (anchor === "center") drawY = opts.y - h / 2;
  ctx.drawImage(img as never, drawX, drawY, w, h);
}

// ---------------------------------------------------------------------------
// Treatment overlays
// ---------------------------------------------------------------------------

export function applyNavyGradientBottom(
  ctx: SKRSContext2D,
  size: number,
  hex: string,
): void {
  const grad = ctx.createLinearGradient(0, size * 0.3, 0, size);
  grad.addColorStop(0, `${hex}00`);
  grad.addColorStop(0.35, `${hex}BF`);
  grad.addColorStop(1, `${hex}FA`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

export function applyNavyGradientTop(
  ctx: SKRSContext2D,
  size: number,
  hex: string,
): void {
  const grad = ctx.createLinearGradient(0, 0, 0, size * 0.7);
  grad.addColorStop(0, `${hex}F2`);
  grad.addColorStop(0.65, `${hex}8C`);
  grad.addColorStop(1, `${hex}00`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

export function applyCenteredVignette(
  ctx: SKRSContext2D,
  size: number,
  hex: string,
): void {
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, `${hex}B3`);
  grad.addColorStop(0.5, `${hex}D1`);
  grad.addColorStop(1, `${hex}B3`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

// ---------------------------------------------------------------------------
// Body text wrap helpers
// ---------------------------------------------------------------------------

export function wrapAndDrawBody(
  ctx: SKRSContext2D,
  text: string,
  opts: { x: number; y: number; maxWidth: number; lineHeight: number },
): number {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > opts.maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  let y = opts.y;
  for (const line of lines) {
    ctx.fillText(line, opts.x, y);
    y += opts.lineHeight;
  }
  return y;
}

export function wrapAndDrawBodyCentered(
  ctx: SKRSContext2D,
  text: string,
  canvasWidth: number,
  opts: { y: number; maxWidth: number; lineHeight: number },
): number {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > opts.maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  let y = opts.y;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    ctx.fillText(line, (canvasWidth - w) / 2, y);
    y += opts.lineHeight;
  }
  return y;
}
