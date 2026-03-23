/**
 * Export Digital Products Kandy templates as JSON:
 * 1) `prompt_schema` per template (vision-extracted layout/style for recreating ads)
 * 2) RankPrompt bundle: assembled Gemini image prompt per template (sample copy rotated from pool)
 *
 * Prerequisites: analyzed rows (`npx tsx scripts/analyze-kandy-templates.ts --digital-products`)
 *
 * Output: ~/Desktop/RankPrompt-Digital-Products-Prompt-Pack/rankprompt-digital-products-pack.json
 *         ~/Desktop/RankPrompt-Digital-Products-Prompt-Pack/digital-products-prompt-schemas.json
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { createClient } from '@supabase/supabase-js';

import type { AdPromptSchema } from '../lib/ad-creatives/types';
import { assembleImagePrompt } from '../lib/ad-creatives/assemble-prompt';
import {
  buildRankPromptBrandContext,
  RANKPROMPT_BRAND_KIT_RAW,
  RANKPROMPT_COPY_POOL,
  RANKPROMPT_OFFER,
  RANKPROMPT_PRODUCT_SERVICE,
  RANKPROMPT_STYLE_DIRECTION_GLOBAL,
} from '../lib/ad-creatives/rankprompt-brand-pack';

const envPath = resolve(process.cwd(), '.env.local');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  const k = t.slice(0, i);
  let v = t.slice(i + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface TemplateRow {
  id: string;
  collection_name: string;
  page_index: number;
  image_url: string;
  vertical: string | null;
  ad_category: string | null;
  prompt_schema: AdPromptSchema | null;
  source_brand: string | null;
}

function dedupeByCollectionPage(rows: TemplateRow[]): TemplateRow[] {
  const seen = new Set<string>();
  const out: TemplateRow[] = [];
  for (const t of rows) {
    const key = `${t.collection_name}:${t.page_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return '';
  return res.text();
}

/** Same structure the analyze script asks Gemini vision to return (for documentation / external tools). */
const VISION_EXTRACTION_SCHEMA_DESCRIPTION = `Structured JSON fields: layout (textPosition, imagePosition, ctaPosition, visualHierarchy), composition (backgroundType, overlayStyle, borderTreatment), typography (headlineStyle, subheadlineStyle, ctaTextStyle, fontPairingNotes), colorStrategy (dominantColors[], contrastApproach, accentUsage), imageryStyle, emotionalTone, ctaStyle (buttonShape, position, textPattern), contentBlocks[{type, content, position}]. See scripts/analyze-kandy-templates.ts SYSTEM_PROMPT.`;

async function main() {
  const agentMd = await fetchText(`${RANKPROMPT_BRAND_KIT_RAW}/docs/AGENT-INSTRUCTIONS.md`);
  const agentExcerpt = agentMd
    ? agentMd.slice(0, 12_000)
    : 'Follow RankPrompt brand kit: purple #6b4eff, RankPrompt one word, Inter + Roboto.';
  const brandContext = buildRankPromptBrandContext(agentExcerpt);

  const select =
    'id, collection_name, page_index, image_url, vertical, ad_category, prompt_schema, source_brand';

  const { data: raw, error } = await supabase
    .from('kandy_templates')
    .select(select)
    .eq('is_active', true)
    .not('prompt_schema', 'is', null)
    .in('vertical', ['saas', 'digital_products'])
    .or('collection_name.ilike.Digital Products%,source_brand.eq."Kandy - Digital Products"')
    .order('page_index', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  const rows = (raw ?? []) as TemplateRow[];
  const deduped = dedupeByCollectionPage(rows);

  const missing = deduped.filter((r) => !r.prompt_schema || typeof r.prompt_schema !== 'object');
  if (missing.length > 0) {
    console.error(`${missing.length} rows missing prompt_schema after dedupe. Run analysis first.`);
    process.exit(1);
  }

  const aspectRatio = '1:1' as const;

  const schemaOnly = deduped.map((r, index) => ({
    index: index + 1,
    id: r.id,
    collection_name: r.collection_name,
    page_index: r.page_index,
    vertical: r.vertical,
    ad_category: r.ad_category,
    image_url: r.image_url,
    prompt_schema: r.prompt_schema as AdPromptSchema,
  }));

  const rankPromptTemplates = deduped.map((r, index) => {
    const schema = r.prompt_schema as AdPromptSchema;
    const sampleCopy = RANKPROMPT_COPY_POOL[index % RANKPROMPT_COPY_POOL.length];
    const assembledImagePrompt = assembleImagePrompt({
      brandContext,
      promptSchema: schema,
      productService: RANKPROMPT_PRODUCT_SERVICE,
      offer: RANKPROMPT_OFFER,
      onScreenText: sampleCopy,
      aspectRatio,
      styleDirection: RANKPROMPT_STYLE_DIRECTION_GLOBAL,
    });

    return {
      index: index + 1,
      id: r.id,
      collection_name: r.collection_name,
      page_index: r.page_index,
      vertical: r.vertical,
      ad_category: r.ad_category,
      reference_image_url: r.image_url,
      sample_on_screen_text: sampleCopy,
      prompt_schema: schema,
      assembled_image_prompt: assembledImagePrompt,
    };
  });

  const outDir = resolve(homedir(), 'Desktop', 'RankPrompt-Digital-Products-Prompt-Pack');
  mkdirSync(outDir, { recursive: true });

  const pack = {
    meta: {
      exportedAt: new Date().toISOString(),
      generator: 'Nativz Cortex — scripts/export-digital-products-rankprompt-json.ts',
      brandKit: 'https://github.com/Anderson-Collaborative/rankprompt-brand-kit',
      filter:
        'Kandy Digital Products book, vertical in (saas, digital_products), is_active, prompt_schema present',
      dedupe: 'One row per collection_name + page_index',
      templateCount: rankPromptTemplates.length,
      rankPrompt: {
        productService: RANKPROMPT_PRODUCT_SERVICE,
        offer: RANKPROMPT_OFFER,
        aspectRatio,
        styleDirectionGlobal: RANKPROMPT_STYLE_DIRECTION_GLOBAL,
        copyPoolLength: RANKPROMPT_COPY_POOL.length,
        usage:
          'Pass assembled_image_prompt to Gemini 3.1 Flash Image (or similar) with reference_image_url as the layout/style reference. Replace sample_on_screen_text for unique creatives. Full ad including brand mark is generated in one image pass.',
      },
      visionExtraction: {
        howToAnalyzeMissingTemplates:
          'npx tsx scripts/analyze-kandy-templates.ts --digital-products',
        outputField: 'prompt_schema on kandy_templates',
        schemaDescription: VISION_EXTRACTION_SCHEMA_DESCRIPTION,
      },
    },
    digitalProductPromptSchemas: schemaOnly,
    rankPromptCreatives: rankPromptTemplates,
  };

  const schemasPath = resolve(outDir, 'digital-products-prompt-schemas.json');
  const packPath = resolve(outDir, 'rankprompt-digital-products-pack.json');

  writeFileSync(
    schemasPath,
    JSON.stringify(
      {
        meta: {
          exportedAt: pack.meta.exportedAt,
          templateCount: schemaOnly.length,
          visionExtraction: pack.meta.visionExtraction,
        },
        templates: schemaOnly,
      },
      null,
      2,
    ),
  );

  writeFileSync(packPath, JSON.stringify(pack, null, 2));

  writeFileSync(
    resolve(outDir, 'README.txt'),
    [
      'RankPrompt × Digital Products — prompt export',
      '',
      `Templates: ${rankPromptTemplates.length} (deduped pages)`,
      '',
      'Files:',
      '- digital-products-prompt-schemas.json — vision-extracted JSON only (recreate any brand)',
      '- rankprompt-digital-products-pack.json — full pack + RankPrompt assembled_image_prompt per template',
      '',
      'Refresh schemas: npx tsx scripts/analyze-kandy-templates.ts --digital-products',
      'Generate PNGs: npx tsx scripts/rankprompt-50-ads.ts',
    ].join('\n'),
  );

  console.log(`Wrote ${rankPromptTemplates.length} templates to:\n  ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
