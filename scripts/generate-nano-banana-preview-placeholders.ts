/**
 * Writes PNG previews into public/nano-banana-previews/ for each catalog row.
 * Replace these with final design references when available; keeps the wizard grid from 404ing.
 *
 *   npx tsx scripts/generate-nano-banana-preview-placeholders.ts
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { NANO_BANANA_CATALOG } from '../lib/ad-creatives/nano-banana/catalog-data';

const OUT_DIR = path.join(process.cwd(), 'public', 'nano-banana-previews');

function slugHue(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function previewSvg(entry: (typeof NANO_BANANA_CATALOG)[0]): string {
  const h = slugHue(entry.slug);
  const h2 = (h + 48) % 360;
  const h3 = (h + 96) % 360;
  const title = escapeXml(entry.name);
  return `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:hsl(${h},42%,28%)"/>
      <stop offset="55%" style="stop-color:hsl(${h2},35%,14%)"/>
      <stop offset="100%" style="stop-color:hsl(${h3},28%,10%)"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="256" y="210" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-family="system-ui,sans-serif" font-size="64" font-weight="600">#${entry.sortOrder}</text>
  <text x="256" y="290" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif" font-size="22" font-weight="500">${title}</text>
</svg>`;
}

async function main() {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  for (const entry of NANO_BANANA_CATALOG) {
    const file = path.basename(entry.previewPublicPath);
    const outPath = path.join(OUT_DIR, file);
    const svg = previewSvg(entry);
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    process.stdout.write(`${file}\n`);
  }
  process.stdout.write(`Done — ${NANO_BANANA_CATALOG.length} files → ${OUT_DIR}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
