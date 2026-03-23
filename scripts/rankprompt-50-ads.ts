/**
 * Generate RankPrompt static ads (Kandy templates × 1 variation each),
 * run QA (with retries), and write PNGs + metadata to ~/Desktop/RankPrompt-Ads-{N}-QA.
 *
 * Defaults: 20 ads, Digital Products Kandy book only (saas / digital_products vertical — no cross-vertical fallback),
 * Gemini 3.1 Flash Image, copy via OpenRouter (default nvidia/nemotron-3-super-120b-a12b:free).
 *
 * Env: RANKPROMPT_AD_COUNT (default 25),
 * RANKPROMPT_TEMPLATE_OFFSET (default 5) — 0-based index into Digital Products templates by page_index; default skips first 5 pages so runs use a fresh template set,
 * Pipeline matches Cortex: one Gemini pass (full ad on canvas — no SVG overlay or post logo composite).
 * RANKPROMPT_SCHEMA_ONLY=1 — use `schema_only` (no template PNG).
 * RANKPROMPT_WIREFRAME=1 — `schema_plus_wireframe` (ignored if SCHEMA_ONLY is set).
 * AD_COPY_OPENROUTER_MODEL (comma-separated, overrides default copy model),
 * GEMINI_IMAGE_MODEL (default gemini-3.1-flash-image-preview).
 *
 * Brand rules: https://github.com/Anderson-Collaborative/rankprompt-brand-kit
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

import type { AdPromptSchema, BrandLayoutMode, OnScreenText } from '../lib/ad-creatives/types';
import type { QAIssue } from '../lib/ad-creatives/qa-check';
import { buildQaRetryStyleSuffix } from '../lib/ad-creatives/qa-retry-hint';
import {
  buildRankPromptBrandContext,
  RANKPROMPT_BRAND_KIT_RAW,
  RANKPROMPT_COPY_POOL,
  RANKPROMPT_OFFER,
  RANKPROMPT_PRODUCT_SERVICE,
} from '../lib/ad-creatives/rankprompt-brand-pack';

const AD_COUNT_MAX = 200;

function resolvedAdCount(): number {
  const raw = parseInt(process.env.RANKPROMPT_AD_COUNT ?? '25', 10);
  const n = Number.isFinite(raw) ? raw : 25;
  return Math.min(AD_COUNT_MAX, Math.max(1, n));
}

/** Skip first N templates (by page_index order) — default 5 uses pages 6–10 instead of 1–5. */
function resolvedTemplateOffset(): number {
  const raw = parseInt(process.env.RANKPROMPT_TEMPLATE_OFFSET ?? '5', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
}

const MAX_CONCURRENT = 3;
const MAX_QA_RETRIES = 2;
const ASPECT_RATIO = '1:1' as const;
const WIDTH = 1080;
const HEIGHT = 1080;

/** When OpenRouter is rate-limited or returns empty, still ship creatives. */
function fallbackRankPromptCopies(n: number): OnScreenText[] {
  const out: OnScreenText[] = [];
  for (let i = 0; i < n; i++) {
    const base = RANKPROMPT_COPY_POOL[i % RANKPROMPT_COPY_POOL.length];
    out.push({
      headline: base.headline,
      subheadline: base.subheadline,
      cta: base.cta,
    });
  }
  return out;
}

function loadEnvLocal(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env.local');
  const env: Record<string, string> = {};
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return '';
  return res.text();
}

async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runOne(): Promise<void> {
    const i = next++;
    if (i >= items.length) return;
    results[i] = await worker(items[i], i);
    await runOne();
  }

  const starters = Array.from({ length: Math.min(limit, items.length) }, () => runOne());
  await Promise.all(starters);
  return results;
}

async function main() {
  const env = loadEnvLocal();
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_AI_STUDIO_KEY']) {
    if (!env[k]) {
      console.error(`Missing ${k} in .env.local`);
      process.exit(1);
    }
  }
  Object.assign(process.env, env);

  process.env.GEMINI_IMAGE_MODEL =
    process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image-preview';

  const AD_COUNT = resolvedAdCount();
  const TEMPLATE_OFFSET = resolvedTemplateOffset();
  let brandLayoutMode: BrandLayoutMode = 'reference_image';
  if (process.env.RANKPROMPT_SCHEMA_ONLY === '1') {
    brandLayoutMode = 'schema_only';
  } else if (process.env.RANKPROMPT_WIREFRAME === '1') {
    brandLayoutMode = 'schema_plus_wireframe';
  }
  console.log(
    `=== RankPrompt — ${AD_COUNT} ads (Digital Products @ offset ${TEMPLATE_OFFSET}, layout: ${brandLayoutMode}, Gemini native image + Nemotron copy) → Desktop ===\n`,
  );

  const agentMd = await fetchText(`${RANKPROMPT_BRAND_KIT_RAW}/docs/AGENT-INSTRUCTIONS.md`);
  const agentExcerpt = agentMd
    ? agentMd.slice(0, 12_000)
    : 'Follow RankPrompt brand kit: purple #6b4eff, RankPrompt one word, Inter + Roboto.';

  const brandContext = buildRankPromptBrandContext(agentExcerpt);
  const fullCtx = brandContext.toFullContext();
  const brandRefs = fullCtx.creativeReferenceImageUrls ?? [];

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const digitalSelect =
    'id, collection_name, page_index, image_url, prompt_schema, source_brand, vertical';

  const { data: templates, error: tErr } = await supabase
    .from('kandy_templates')
    .select(digitalSelect)
    .eq('is_active', true)
    .not('prompt_schema', 'is', null)
    .in('vertical', ['saas', 'digital_products'])
    .or(
      'collection_name.ilike.Digital Products%,source_brand.eq."Kandy - Digital Products"',
    )
    .order('page_index', { ascending: true })
    .range(TEMPLATE_OFFSET, TEMPLATE_OFFSET + AD_COUNT - 1);

  if (tErr) {
    console.error('Failed to load Kandy templates:', tErr.message);
    process.exit(1);
  }

  if (!templates?.length) {
    console.error(
      'No analyzed Digital Products templates (vertical saas or digital_products, with prompt_schema). Run:\n' +
        '  npx tsx scripts/analyze-kandy-templates.ts --digital-products',
    );
    process.exit(1);
  }

  if (templates.length < AD_COUNT) {
    console.warn(`Only ${templates.length} templates available (wanted ${AD_COUNT}). Generating that many.`);
  }

  const n = Math.min(AD_COUNT, templates.length);
  const slice = templates.slice(0, n);

  const verticals = [
    ...new Set(
      slice
        .map((t) => (t.vertical ?? '').trim())
        .filter((v) => v.length > 0),
    ),
  ];
  if (verticals.length > 1) {
    console.error(
      'Mixed Kandy verticals in this run (data issue). Expected one industry per batch:',
      verticals.join(', '),
    );
    process.exit(1);
  }

  const { generateAdCopy } = await import('../lib/ad-creatives/generate-copy');
  console.log(`Generating ${n} unique copy sets…`);
  let copyVariations: OnScreenText[] = [];
  try {
    copyVariations = await generateAdCopy({
      brandContext,
      productService: RANKPROMPT_PRODUCT_SERVICE,
      offer: RANKPROMPT_OFFER,
      count: n,
      fixedCta: 'Try for free',
    });
  } catch (e) {
    console.warn('AI copy generation failed (OpenRouter empty/rate limit). Using RankPrompt fallback copy.', e);
  }

  if (copyVariations.length < n) {
    const need = n - copyVariations.length;
    console.warn(
      `Only ${copyVariations.length} AI copy lines; padding ${need} from RankPrompt fallback pool.`,
    );
    copyVariations = copyVariations.concat(fallbackRankPromptCopies(need)).slice(0, n);
  }

  const { generateCreativeBrief } = await import('../lib/ad-creatives/generate-creative-brief');
  const creativeBriefParagraph = (
    await generateCreativeBrief({
      brandContext,
      productService: RANKPROMPT_PRODUCT_SERVICE,
      offer: RANKPROMPT_OFFER,
    })
  ).trim();
  if (creativeBriefParagraph) {
    console.log('Creative brief (batch):', creativeBriefParagraph.split('\n').slice(0, 3).join(' '));
  }

  const outDir = resolve(homedir(), 'Desktop', `RankPrompt-Ads-${n}-QA`);
  mkdirSync(outDir, { recursive: true });

  const { assembleImagePrompt } = await import('../lib/ad-creatives/assemble-prompt');
  const { generateAdImage } = await import('../lib/ad-creatives/generate-image');
  const { buildLayoutWireframePng } = await import('../lib/ad-creatives/layout-wireframe');
  const { qaCheckAd } = await import('../lib/ad-creatives/qa-check');

  type RowResult = {
    index: number;
    templateId: string;
    kandyVertical: string | null;
    collection: string;
    pageIndex: number;
    copy: OnScreenText;
    qaPassed: boolean;
    qaScore: number;
    qaIssues: QAIssue[];
    attempts: number;
    file?: string;
    error?: string;
  };

  const rows = await runPool(slice, MAX_CONCURRENT, async (template, index) => {
    const copy = copyVariations[index];
    const row: RowResult = {
      index: index + 1,
      templateId: template.id,
      kandyVertical: template.vertical ?? null,
      collection: template.collection_name ?? '',
      pageIndex: template.page_index ?? 0,
      copy,
      qaPassed: false,
      qaScore: 0,
      qaIssues: [],
      attempts: 0,
    };

    try {
      let imageBuffer: Buffer | null = null;
      let qaResult = {
        passed: true,
        issues: [] as QAIssue[],
        confidence: 0,
      };

      let qaRetryStyleSuffix = '';
      for (let attempt = 0; attempt <= MAX_QA_RETRIES; attempt++) {
        row.attempts = attempt + 1;
        const styleDirection = qaRetryStyleSuffix || undefined;
        const refUrl =
          brandLayoutMode === 'reference_image' && template.image_url ? template.image_url : undefined;
        let layoutWireframePng: Buffer | undefined;
        if (brandLayoutMode === 'schema_plus_wireframe') {
          layoutWireframePng = await buildLayoutWireframePng(
            WIDTH,
            HEIGHT,
            template.prompt_schema as AdPromptSchema,
          );
        }

        const prompt = assembleImagePrompt({
          brandContext,
          promptSchema: template.prompt_schema as AdPromptSchema,
          productService: RANKPROMPT_PRODUCT_SERVICE,
          offer: RANKPROMPT_OFFER,
          onScreenText: copy,
          aspectRatio: ASPECT_RATIO,
          styleDirection,
          creativeBrief: creativeBriefParagraph || undefined,
        });

        imageBuffer = await generateAdImage({
          prompt,
          referenceImageUrl: refUrl,
          layoutWireframePng,
          brandReferenceImageUrls: brandRefs.length > 0 ? brandRefs : undefined,
          aspectRatio: ASPECT_RATIO,
        });

        qaResult = await qaCheckAd({
          imageBuffer,
          intendedText: copy,
          offer: RANKPROMPT_OFFER,
          brandName: 'RankPrompt',
          productService: RANKPROMPT_PRODUCT_SERVICE,
          canonicalClientWebsiteUrl: brandContext.clientWebsiteUrl,
          expectedWidth: WIDTH,
          expectedHeight: HEIGHT,
        });

        if (qaResult.passed) break;
        console.warn(
          `  [${row.index}/${n}] QA retry ${attempt + 1}: ${qaResult.issues.map((i) => i.description).join('; ')}`,
        );
        if (attempt < MAX_QA_RETRIES) {
          qaRetryStyleSuffix = buildQaRetryStyleSuffix(qaResult.issues);
        }
      }

      if (!imageBuffer) throw new Error('No image buffer');

      const basename = `ad-${String(row.index).padStart(3, '0')}`;
      const pngPath = resolve(outDir, `${basename}.png`);
      writeFileSync(pngPath, imageBuffer);
      row.file = pngPath;
      row.qaPassed = qaResult.passed;
      row.qaScore = qaResult.confidence;
      row.qaIssues = qaResult.issues;

      writeFileSync(
        resolve(outDir, `${basename}.meta.json`),
        JSON.stringify(
          {
            templateId: row.templateId,
            kandyVertical: row.kandyVertical,
            collection: row.collection,
            pageIndex: row.pageIndex,
            copy: row.copy,
            qaPassed: row.qaPassed,
            qaScore: row.qaScore,
            qaIssues: row.qaIssues,
            attempts: row.attempts,
            brandLayoutMode,
            imagePipeline: 'gemini_native',
          },
          null,
          2,
        ),
      );

      console.log(
        `  [${row.index}/${n}] ${row.qaPassed ? 'PASS' : 'FAIL'} QA (score ${row.qaScore}) → ${basename}.png`,
      );
    } catch (err) {
      row.error = err instanceof Error ? err.message : String(err);
      console.error(`  [${row.index}/${n}] ERROR: ${row.error}`);
    }

    return row;
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    outputDir: outDir,
    brandKit: 'https://github.com/Anderson-Collaborative/rankprompt-brand-kit',
    kandyVertical: verticals[0] ?? null,
    productService: RANKPROMPT_PRODUCT_SERVICE,
    offer: RANKPROMPT_OFFER,
    total: n,
    brandLayoutMode,
    imagePipeline: 'gemini_native',
    qaPassed: rows.filter((r) => r.qaPassed && !r.error).length,
    qaFailed: rows.filter((r) => !r.qaPassed && !r.error).length,
    errors: rows.filter((r) => r.error).length,
    rows,
  };

  writeFileSync(resolve(outDir, 'qa-summary.json'), JSON.stringify(summary, null, 2));

  writeFileSync(
    resolve(outDir, 'README.txt'),
    [
      'RankPrompt static ads — generated by Nativz Cortex ad engine',
      `Folder: ${outDir}`,
      `Brand kit: ${summary.brandKit}`,
      `Creatives: ${n - summary.errors} PNG files`,
      `QA passed (strict): ${summary.qaPassed}`,
      `QA failed (review recommended): ${summary.qaFailed}`,
      `Generation errors: ${summary.errors}`,
      '',
      'Each ad-N.meta.json contains headline, subheadline, CTA, and QA issue details.',
      'Open qa-summary.json for the full run log.',
    ].join('\n'),
  );

  console.log(`\nDone. Output: ${outDir}`);
  console.log(`QA passed: ${summary.qaPassed} / ${n} (see qa-summary.json for failures)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
