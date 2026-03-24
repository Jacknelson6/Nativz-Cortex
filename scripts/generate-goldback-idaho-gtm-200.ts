/**
 * Builds 200 Goldback Idaho ads — ID GTM creative direction, Web + Web 2 imagery,
 * slot-aware copy (headline/subhead/offer matched to each Nano Banana layout).
 *
 * Run: npx tsx scripts/generate-goldback-idaho-gtm-200.ts
 *
 * Env (optional):
 *   GOLDBACK_IDGT_OUT_DIR — output folder (default: ~/Desktop/Goldback-Idaho-GTM-200-<stamp>)
 *   GOLDBACK_IDGT_IMAGE_DIRS — colon-separated absolute paths (overrides defaults)
 */
import * as fs from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

import { NANO_BANANA_CATALOG } from '../lib/ad-creatives/nano-banana/catalog-data';
import { fillNanoBananaTemplate } from '../lib/ad-creatives/nano-banana/fill-template';
import { buildMetaPerformanceSlotOrder } from '../lib/ad-creatives/nano-banana/bulk-presets';
import { IDGT_STYLE_DIRECTION_BASE } from './data/goldback-idaho-gtm-pools';
import { buildIdgtCopyRowForSlug } from './data/goldback-idaho-gtm-slot-copy';

const N = 200;
/** Primary Idaho product photography (per art direction). */
const DEFAULT_IMAGE_DIRS = ['/Users/jack/Desktop/Web', '/Users/jack/Desktop/Web 2'];
const POOL_FILE = resolve(process.cwd(), 'scripts/.goldback-idaho-image-pool.txt');

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

function walkImages(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  let st: fs.Stats;
  try {
    st = fs.statSync(dir);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;
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

function collectImagePool(): string[] {
  const dirsEnv = process.env.GOLDBACK_IDGT_IMAGE_DIRS?.trim();
  const dirs = dirsEnv
    ? dirsEnv.split(':').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_IMAGE_DIRS;

  const raw: string[] = [];
  for (const d of dirs) walkImages(d, raw);

  if (fs.existsSync(POOL_FILE)) {
    const lines = fs
      .readFileSync(POOL_FILE, 'utf8')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (fs.existsSync(line) && IMAGE_EXT.test(line)) raw.push(line);
    }
  }

  const uniq = [...new Set(raw)].sort((a, b) => a.localeCompare(b));
  return uniq;
}

function desktopSub(p: string): string {
  return resolve(homedir(), 'Desktop', p);
}

function main(): void {
  const slugs = buildMetaPerformanceSlotOrder(N);
  if (slugs.length !== N) throw new Error(`expected ${N} slugs, got ${slugs.length}`);

  const IMAGE_POOL = collectImagePool();
  if (IMAGE_POOL.length < 20) {
    throw new Error(
      `image pool too small (${IMAGE_POOL.length}). Check Web / Web 2 paths and scripts/.goldback-idaho-image-pool.txt`,
    );
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const OUT_DIR =
    process.env.GOLDBACK_IDGT_OUT_DIR?.trim() || desktopSub(`Goldback-Idaho-GTM-200-${stamp}`);

  const bySlug = new Map(NANO_BANANA_CATALOG.map((e) => [e.slug, e]));
  const ads = slugs.map((slug, i) => {
    const entry = bySlug.get(slug);
    if (!entry) throw new Error(`bad slug ${slug}`);
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
      meta_batch: 'goldback-idaho-gtm-200-v2-slot-copy',
    };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(resolve(OUT_DIR, '200-ads.generated.json'), JSON.stringify({ ads }, null, 2));
  fs.writeFileSync(
    resolve(OUT_DIR, 'cortex-creative-overrides.json'),
    JSON.stringify(
      {
        creativeOverrides: ads.map((a) => ({
          templateId: a.nano_banana_slug,
          variationIndex: 0,
          headline: a.headline,
          subheadline: a.subheadline,
          cta: a.cta,
          styleNotes: a.client_image_modifier,
        })),
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    resolve(OUT_DIR, 'image-pool-used.txt'),
    `${IMAGE_POOL.length} images\n\n${IMAGE_POOL.join('\n')}`,
  );
  console.log(`Wrote ${ads.length} ads to ${OUT_DIR}`);
  console.log(`Image pool: ${IMAGE_POOL.length} files`);
}

main();
