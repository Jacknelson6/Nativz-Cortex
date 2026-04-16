/**
 * Rasterize agency SVG logos to flat-white JPGs for PDF use. The base64
 * PNGs in lib/brand-logo.ts produced corrupt output in @react-pdf/renderer
 * regardless of how they were re-encoded; rendering directly from SVG
 * sidesteps the bad source data.
 *
 * Run:  npx tsx scripts/rasterize-logos.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

interface LogoSpec {
  svg: string;
  out: string;
  width: number;
}

const SPECS: LogoSpec[] = [
  // AC viewBox is 2103x634 — render wide so the "ANDERSON COLLABORATIVE"
  // wordmark next to the monogram is legible.
  { svg: 'public/anderson-logo-dark.svg', out: 'public/anderson-logo-on-light.jpg', width: 1400 },
  // Nativz existing logo renders fine — keep the existing JPG as is, but
  // re-source from a clean path if the file is missing.
];

async function main() {
  for (const spec of SPECS) {
    const svg = fs.readFileSync(spec.svg);
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: spec.width } });
    const png = resvg.render().asPng();
    // Flatten alpha → white, save as high-quality JPG for @react-pdf reliability
    await sharp(png)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 92, progressive: false })
      .toFile(path.resolve(spec.out));
    const stat = fs.statSync(spec.out);
    console.log('✓', spec.out, `(${stat.size.toLocaleString()} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
