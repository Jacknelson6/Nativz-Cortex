// ---------------------------------------------------------------------------
// Ad Creatives v2 — Chroma-Key White Background Removal
// ---------------------------------------------------------------------------
//
// Many brand product photos are shot on white studio backgrounds. Dropping
// those unmodified onto a cream / charcoal / red ad background leaves a
// visible white rectangle around the subject — the "floating photo on
// wrong bg" problem.
//
// This helper samples the photo's corner pixels to determine the actual
// background color, then marks pixels within `tolerance` of that color as
// transparent. Works great for studio shots on solid white / near-white.
// For photos with complex backgrounds, use a real bg-removal service
// (remove.bg, Cloudinary) and skip this helper.

import { createCanvas, type Canvas, type Image } from "@napi-rs/canvas";

export interface ChromaKeyOptions {
  /** RGB distance tolerance. Default 18 — good for studio shots. */
  tolerance?: number;
  /** Feather radius for edge softening (in pixels). Default 2. */
  feather?: number;
}

/**
 * Apply white-background chroma-key to an image, returning a canvas with
 * the background made transparent.
 *
 * Strategy:
 *  1. Sample 5 corner-ish pixels to determine the bg color (mean).
 *  2. For each pixel, compute squared-distance from bg color in RGB.
 *  3. Within `tolerance` → fully transparent.
 *  4. Within `tolerance + feather` → partial alpha (linear falloff).
 *  5. Otherwise → fully opaque.
 */
export function chromaKeyRemoveBg(
  img: Image,
  opts: ChromaKeyOptions = {},
): Canvas {
  const tolerance = opts.tolerance ?? 18;
  const feather = opts.feather ?? 2;

  const w = img.width;
  const h = img.height;
  const canvas = createCanvas(w, h) as Canvas;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img as never, 0, 0);

  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Sample 4 corners + center. If corners are clearly near-white, assume
  // the bg is the mean of the corners.
  const samples = [
    sample(px, w, h, 2, 2),
    sample(px, w, h, w - 3, 2),
    sample(px, w, h, 2, h - 3),
    sample(px, w, h, w - 3, h - 3),
  ];
  const bgR = Math.round(samples.reduce((s, p) => s + p.r, 0) / samples.length);
  const bgG = Math.round(samples.reduce((s, p) => s + p.g, 0) / samples.length);
  const bgB = Math.round(samples.reduce((s, p) => s + p.b, 0) / samples.length);

  // If the sampled bg isn't close to white-ish (brightness > 200), skip —
  // the photo probably doesn't have a clean white background and we'd
  // damage it by trying.
  const brightness = (bgR + bgG + bgB) / 3;
  if (brightness < 200) {
    return canvas;
  }

  const tolSq = tolerance * tolerance * 3;
  const featherSq = (tolerance + feather) * (tolerance + feather) * 3;

  for (let i = 0; i < px.length; i += 4) {
    const dr = px[i] - bgR;
    const dg = px[i + 1] - bgG;
    const db = px[i + 2] - bgB;
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq <= tolSq) {
      px[i + 3] = 0;
    } else if (distSq < featherSq) {
      const t = (distSq - tolSq) / (featherSq - tolSq);
      px[i + 3] = Math.round(px[i + 3] * t);
    }
  }

  ctx.putImageData(data, 0, 0);
  return canvas;
}

function sample(
  pixels: Uint8ClampedArray,
  w: number,
  _h: number,
  x: number,
  y: number,
): { r: number; g: number; b: number } {
  const i = (y * w + x) * 4;
  return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
}
