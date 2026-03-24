/**
 * Run Gemini image generation for Goldback Idaho ads using Cortex Nano Banana templates.
 *
 * Reads:
 *   - Brand DNA text: GOLDBACK_BRAND_DNA_FILE, else ~/Desktop/Goldback-Idaho-NanoBanana-30/brand-dna-prompt-block.txt,
 *     else scripts/data/goldback-nano-banana-default-brand-dna.txt
 *   - Ad rows: GOLDBACK_ADS_JSON or ~/Desktop/Goldback-Idaho-NanoBanana-20/20-ads.generated.json
 *
 * Env (from .env.local): GOOGLE_AI_STUDIO_KEY (required)
 * Optional: GOLDBACK_AD_LIMIT (default all), GOLDBACK_ASPECT_RATIO (default 1:1), GOLDBACK_OUT_DIR,
 *   GOLDBACK_CONCURRENCY (default 3, max 5)
 *
 * Outputs PNGs + manifest to ~/Desktop/Goldback-Idaho-Gemini-<timestamp>/
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

import type { BrandContext } from '../lib/knowledge/brand-context';
import type { AspectRatio } from '../lib/ad-creatives/types';
import { buildNanoBananaImagePrompt } from '../lib/ad-creatives/nano-banana/build-nano-prompt';
import { generateAdImage } from '../lib/ad-creatives/generate-image';
import { getNanoBananaBySlug } from '../lib/ad-creatives/nano-banana/catalog';

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

function desktop(p: string): string {
  return resolve(homedir(), 'Desktop', p);
}

const REPO_DEFAULT_DNA = resolve(process.cwd(), 'scripts/data/goldback-nano-banana-default-brand-dna.txt');

function expandUserPath(p: string): string {
  if (p.startsWith('~/')) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

/** Env path, else Desktop export, else repo fallback so CLI runs without a manual DNA export. */
function resolveGoldbackDnaPath(): string {
  const env = process.env.GOLDBACK_BRAND_DNA_FILE?.trim();
  if (env) {
    const p = expandUserPath(env);
    if (existsSync(p)) return p;
    console.warn(`[goldback-gemini] GOLDBACK_BRAND_DNA_FILE not found (${p}), using repo default.`);
  }
  const desk = desktop('Goldback-Idaho-NanoBanana-30/brand-dna-prompt-block.txt');
  if (existsSync(desk)) return desk;
  if (existsSync(REPO_DEFAULT_DNA)) return REPO_DEFAULT_DNA;
  throw new Error(
    `No brand DNA file. Set GOLDBACK_BRAND_DNA_FILE or add ${desk} or keep ${REPO_DEFAULT_DNA}`,
  );
}

function mimeForPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function goldbackBrandContext(dnaFile: string): BrandContext {
  const dna = readFileSync(dnaFile, 'utf8');
  const emptyVi = {
    colors: [] as { hex: string; name?: string; role?: string }[],
    fonts: [] as { family: string; role?: string; weight?: string }[],
    logos: [] as { url: string; variant?: string }[],
    screenshots: [] as { url: string; page?: string; description?: string }[],
    designStyle: null,
  };
  const base = {
    fromGuideline: false,
    guidelineId: null,
    guidelineContent: null,
    clientName: 'Goldback',
    clientIndustry: 'Spendable gold currency',
    clientWebsiteUrl: 'https://goldback.com',
    visualIdentity: emptyVi,
    verbalIdentity: {
      tonePrimary: null as string | null,
      voiceAttributes: [] as string[],
      messagingPillars: [] as string[],
      vocabularyPatterns: [] as string[],
      avoidancePatterns: [] as string[],
    },
    products: [] as { name: string; description?: string; imageUrl?: string | null; price?: string | null; offeringType?: string | null }[],
    audience: { summary: null as string | null },
    positioning: null as string | null,
    metadata: null,
    creativeSupplementBlock: '',
    creativeReferenceImageUrls: [] as string[],
  };
  return {
    ...base,
    toPromptBlock: () => dna,
    toFullContext: () => ({
      clientName: base.clientName,
      clientIndustry: base.clientIndustry,
      clientWebsiteUrl: base.clientWebsiteUrl,
      visualIdentity: base.visualIdentity,
      verbalIdentity: base.verbalIdentity,
      products: base.products,
      audience: base.audience,
      positioning: base.positioning,
      guidelineContent: base.guidelineContent,
      metadata: base.metadata,
      creativeSupplementBlock: base.creativeSupplementBlock,
      creativeReferenceImageUrls: base.creativeReferenceImageUrls,
    }),
  } as BrandContext;
}

type AdRow = {
  ad_index: number;
  nano_banana_slug: string;
  headline: string;
  subheadline: string;
  cta: string;
  offer: string | null;
  product_service: string;
  local_reference_image: string;
  client_image_modifier: string;
  filled_nano_banana_template: string;
};

async function runPool<T, R>(items: T[], limit: number, worker: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function runOne(): Promise<void> {
    const i = next++;
    if (i >= items.length) return;
    results[i] = await worker(items[i], i);
    await runOne();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runOne()));
  return results;
}

async function main(): Promise<void> {
  loadEnvLocal();
  if (!process.env.GOOGLE_AI_STUDIO_KEY?.trim()) {
    console.error('Missing GOOGLE_AI_STUDIO_KEY in .env.local');
    process.exit(1);
  }

  const dnaPath = resolveGoldbackDnaPath();
  const adsPath =
    process.env.GOLDBACK_ADS_JSON?.trim() ||
    desktop('Goldback-Idaho-NanoBanana-20/20-ads.generated.json');

  const aspectRatio = (process.env.GOLDBACK_ASPECT_RATIO?.trim() || '1:1') as AspectRatio;
  const limitRaw = parseInt(process.env.GOLDBACK_AD_LIMIT ?? '', 10);
  const adLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  const concRaw = parseInt(process.env.GOLDBACK_CONCURRENCY ?? '3', 10);
  const concurrency = Math.min(5, Math.max(1, Number.isFinite(concRaw) ? concRaw : 3));

  const brandContext = goldbackBrandContext(dnaPath);
  const { ads: rawAds } = JSON.parse(readFileSync(adsPath, 'utf8')) as { ads: AdRow[] };
  const ads = adLimit ? rawAds.slice(0, adLimit) : rawAds;

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const outDir =
    process.env.GOLDBACK_OUT_DIR?.trim() || desktop(`Goldback-Idaho-Gemini-${stamp}`);
  mkdirSync(outDir, { recursive: true });

  console.log(`Brand DNA: ${dnaPath}`);
  console.log(`Ads JSON: ${adsPath} (${ads.length} ads)`);
  console.log(`Output: ${outDir}`);
  console.log(`Model: ${process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image-preview'}`);
  console.log(`Concurrency: ${concurrency}`);

  const manifest: Record<string, unknown>[] = [];

  const results = await runPool(ads, concurrency, async (ad) => {
    const imgPath = ad.local_reference_image;
    if (!existsSync(imgPath)) {
      const fileBaseEarly = `${String(ad.ad_index).padStart(3, '0')}-${ad.nano_banana_slug}`;
      const err = `Reference image missing (download from iCloud or fix path): ${imgPath}`;
      console.error(`FAIL ${fileBaseEarly}:`, err);
      const miss: Record<string, unknown> = {
        ad_index: ad.ad_index,
        slug: ad.nano_banana_slug,
        reference: imgPath,
        ok: false,
        error: err,
      };
      manifest.push(miss);
      return miss;
    }
    const buf = readFileSync(imgPath);
    const b64 = buf.toString('base64');
    const nano = getNanoBananaBySlug(ad.nano_banana_slug);
    const styleDirection = nano
      ? `Nano Banana style #${nano.sortOrder} (${nano.name}): ${nano.promptTemplate.split('\n')[1] ?? ''}`.slice(0, 2000)
      : undefined;

    const prompt = buildNanoBananaImagePrompt({
      imagePromptModifier: ad.client_image_modifier,
      brandContext,
      filledTemplateBody: ad.filled_nano_banana_template,
      aspectRatio,
      productService: ad.product_service,
      offer: ad.offer,
      styleDirection,
    });

    const fileBase = `${String(ad.ad_index).padStart(3, '0')}-${ad.nano_banana_slug}`;
    const entry: Record<string, unknown> = {
      ad_index: ad.ad_index,
      slug: ad.nano_banana_slug,
      reference: imgPath,
      ok: false,
    };

    try {
      const png = await generateAdImage({
        prompt,
        productImagesInline: [{ mimeType: mimeForPath(imgPath), data: b64 }],
        aspectRatio,
      });
      const outFile = resolve(outDir, `${fileBase}.png`);
      mkdirSync(outDir, { recursive: true });
      try {
        statSync(outDir);
      } catch {
        throw new Error(`Output directory not accessible: ${outDir}`);
      }
      writeFileSync(outFile, png);
      entry.ok = true;
      entry.output = outFile;
      console.log(`OK  ${fileBase}.png`);
    } catch (e) {
      entry.error = e instanceof Error ? e.message : String(e);
      console.error(`FAIL ${fileBase}:`, entry.error);
    }

    manifest.push(entry);
    return entry;
  });

  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify({ ads: results, promptNote: 'full prompts not stored — see Cortex buildNanoBananaImagePrompt' }, null, 2));

  const ok = results.filter((r) => r.ok).length;
  console.log(`\nDone: ${ok}/${results.length} images written to ${outDir}`);
  if (ok < results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
