/**
 * Generates Nativz-branded PDF: Avondale 50 video ideas with report-backed insights.
 *
 * Usage: npx tsx scripts/generate-avondale-video-ideas-pdf.tsx
 * Output: docs/avondale-50-video-ideas.pdf
 */

import { createElement } from 'react';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { renderToBuffer } from '@react-pdf/renderer';
import { AvondaleVideoIdeasPdfDocument } from '../lib/pdf/avondale-video-ideas-template';
import { AVONDALE_VIDEO_IDEAS } from '../lib/pdf/avondale-video-ideas-data';

async function main() {
  const outPath = resolve(process.cwd(), 'docs/avondale-50-video-ideas.pdf');
  const doc = createElement(AvondaleVideoIdeasPdfDocument, { ideas: AVONDALE_VIDEO_IDEAS });
  const buffer = await renderToBuffer(doc);
  writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath} (${buffer.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
