import sharp from 'sharp';
import type { AdPromptSchema } from './types';

/**
 * Neutral zone map (no letters) — spatial hint for Gemini when `brandLayoutMode` is `schema_plus_wireframe`.
 * Lighter / darker rectangles only; model must not paint visible "frames" from this.
 */
export async function buildLayoutWireframePng(
  width: number,
  height: number,
  schema: AdPromptSchema,
): Promise<Buffer> {
  const textHeavy = /\bleft\b|column|stack/i.test(
    `${schema.layout.textPosition} ${schema.layout.visualHierarchy}`,
  );
  const textFracW = textHeavy ? 0.48 : 0.42;
  const x0 = 0;
  const y0 = 0;
  const tw = Math.round(width * textFracW);
  const th = height;

  const ctaW = Math.min(Math.round(width * 0.42), 480);
  const ctaH = Math.round(height * 0.09);
  const ctaX = Math.round(width * 0.06);
  const ctaY = height - ctaH - Math.round(height * 0.12);

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#e8e8ea"/>
  <rect x="${x0}" y="${y0}" width="${tw}" height="${th}" fill="#000000" opacity="0.035"/>
  <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="${ctaH}" rx="${Math.round(ctaH * 0.35)}" fill="#000000" opacity="0.05"/>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
