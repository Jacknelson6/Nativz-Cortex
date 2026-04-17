// ---------------------------------------------------------------------------
// Ad Creatives v2 — Vector Shape Helpers
// ---------------------------------------------------------------------------
//
// Glyphs like ★ ✓ ✗ are not in the @fontsource Latin subset — they render as
// empty squares. These helpers draw the shapes directly as canvas paths so
// layouts can include them without depending on any font.
//
// Ported from morning-ads/scripts/src/crystal-creek/utils.ts.

import type { SKRSContext2D } from "@napi-rs/canvas";

/** Draw a stroked checkmark inside the box (x, y, size). */
export function drawCheckmark(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  size: number,
  colorHex: string,
): void {
  ctx.save();
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = Math.max(2, size * 0.18);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.55);
  ctx.lineTo(x + size * 0.38, y + size * 0.9);
  ctx.lineTo(x + size, y + size * 0.15);
  ctx.stroke();
  ctx.restore();
}

/** Draw a stroked X mark inside the box (x, y, size). */
export function drawXmark(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  size: number,
  colorHex: string,
): void {
  ctx.save();
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + size * 0.15, y + size * 0.15);
  ctx.lineTo(x + size * 0.85, y + size * 0.85);
  ctx.moveTo(x + size * 0.85, y + size * 0.15);
  ctx.lineTo(x + size * 0.15, y + size * 0.85);
  ctx.stroke();
  ctx.restore();
}

/** Draw a filled five-point star centered at (cx, cy) with outer radius. */
export function drawStar(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  outerR: number,
  colorHex: string,
): void {
  const innerR = outerR * 0.45;
  ctx.save();
  ctx.fillStyle = colorHex;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = -Math.PI / 2 + (Math.PI * i) / 5;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draw a horizontal row of stars. Returns the x cursor after the last star. */
export function drawStarRow(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  count: number,
  starR: number,
  gap: number,
  colorHex: string,
): number {
  let cx = x + starR;
  for (let i = 0; i < count; i++) {
    drawStar(ctx, cx, y, starR, colorHex);
    cx += starR * 2 + gap;
  }
  return cx;
}
