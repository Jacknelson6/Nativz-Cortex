/**
 * Five Idaho GTM sample ads — same slot-aware copy as the 200-ad generator.
 * Run: npx tsx scripts/generate-goldback-idaho-gtm-samples-5.ts
 */
import * as fs from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

import { NANO_BANANA_CATALOG } from '../lib/ad-creatives/nano-banana/catalog-data';
import { fillNanoBananaTemplate } from '../lib/ad-creatives/nano-banana/fill-template';
import { IDGT_STYLE_DIRECTION_BASE } from './data/goldback-idaho-gtm-pools';
import { buildIdgtCopyRowForSlug } from './data/goldback-idaho-gtm-slot-copy';

const SAMPLE_SLUGS = [
  'soft-gradient-product',
  'ugc-handheld',
  'headline',
  'split-screen',
  '3d-mockup',
] as const;

const WEB_DIRS = ['/Users/jack/Desktop/Web', '/Users/jack/Desktop/Web 2'];
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

function walkImages(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const p = resolve(dir, name);
    let s: fs.Stats;
    try {
      s = fs.statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) walkImages(p, out);
    else if (IMAGE_EXT.test(name)) out.push(p);
  }
}

function main(): void {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const OUT_DIR = resolve(homedir(), 'Desktop', `Goldback-Idaho-GTM-5-samples-${stamp}`);

  const raw: string[] = [];
  for (const d of WEB_DIRS) walkImages(d, raw);
  const IMAGE_POOL = [...new Set(raw)].sort((a, b) => a.localeCompare(b));
  if (IMAGE_POOL.length < 5) {
    throw new Error(
      `Need at least 5 images under Web + Web 2 (found ${IMAGE_POOL.length}). Check ${WEB_DIRS.join(', ')}`,
    );
  }

  const bySlug = new Map(NANO_BANANA_CATALOG.map((e) => [e.slug, e]));

  const ads = SAMPLE_SLUGS.map((slug, i) => {
    const entry = bySlug.get(slug);
    if (!entry) throw new Error(`Unknown slug ${slug}`);
    const { headline, subheadline, cta, offer, product_service } = buildIdgtCopyRowForSlug(slug, i);
    const ref = IMAGE_POOL[i % IMAGE_POOL.length];
    const filled = fillNanoBananaTemplate(entry.promptTemplate, {
      onScreenText: { headline, subheadline, cta },
      productService: product_service,
      offer,
    });
    return {
      ad_index: i + 1,
      nano_banana_slug: slug,
      nano_banana_name: entry.name,
      nano_type: entry.nanoType,
      sort_order: entry.sortOrder,
      headline,
      subheadline,
      cta,
      offer: offer || null,
      product_service,
      local_reference_image: ref,
      client_image_modifier: `${IDGT_STYLE_DIRECTION_BASE} Reference file: ${ref}`,
      filled_nano_banana_template: filled,
      meta_batch: 'goldback-idaho-gtm-samples-5-v3-slot-copy',
    };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(resolve(OUT_DIR, '5-samples.generated.json'), JSON.stringify({ ads }, null, 2));
  fs.writeFileSync(
    resolve(OUT_DIR, 'README.txt'),
    [
      'Idaho GTM — 5 samples (slot-aware copy, same as 200 batch)',
      '',
      'Render PNGs:',
      `  GOLDBACK_ADS_JSON=${OUT_DIR}/5-samples.generated.json \\`,
      `  GOLDBACK_OUT_DIR=${OUT_DIR}/samples-png \\`,
      '  npx tsx scripts/nano-banana-goldback-gemini-batch.ts',
      '',
      `Image pool: ${IMAGE_POOL.length} files from Web + Web 2`,
    ].join('\n'),
  );

  console.log(`Wrote ${ads.length} sample rows to ${OUT_DIR}`);
  console.log(`  JSON: ${OUT_DIR}/5-samples.generated.json`);
  console.log(`  Next: GOLDBACK_ADS_JSON=${OUT_DIR}/5-samples.generated.json GOLDBACK_OUT_DIR=${OUT_DIR}/samples-png npx tsx scripts/nano-banana-goldback-gemini-batch.ts`);
}

main();
