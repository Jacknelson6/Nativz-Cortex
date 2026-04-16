/**
 * Render branded-deliverable PDFs for both agency themes to ~/Desktop so
 * they can be opened without the dev server or Vercel deploy.
 *
 * Run:  npx tsx scripts/render-branded-preview.tsx
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { getTheme, type AgencySlug } from '../lib/branding';
import { BrandedDeliverableDocument } from '../lib/pdf/branded';
import { BRANDED_PREVIEW_FIXTURE } from '../lib/pdf/branded/_preview-fixture';

async function main() {
  const outDir = path.join(os.homedir(), 'Desktop');
  const slugs: AgencySlug[] = ['nativz', 'anderson'];

  for (const slug of slugs) {
    const theme = getTheme(slug);
    const buffer = await renderToBuffer(
      createElement(BrandedDeliverableDocument, { data: BRANDED_PREVIEW_FIXTURE, theme }),
    );
    const out = path.join(outDir, `Branded-Deliverable-Preview-${theme.name.replace(/\s+/g, '-')}.pdf`);
    fs.writeFileSync(out, buffer);
    console.log('✓', out, `(${buffer.length.toLocaleString()} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
