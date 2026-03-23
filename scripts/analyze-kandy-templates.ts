// scripts/analyze-kandy-templates.ts
// Reads kandy_templates records missing prompt_schema, analyzes each image
// with Gemini vision via extractAdPrompt(), and updates the record.
//
// Usage: npx tsx scripts/analyze-kandy-templates.ts
//        npx tsx scripts/analyze-kandy-templates.ts --limit 20    # process at most 20
//        npx tsx scripts/analyze-kandy-templates.ts --dry-run     # list templates without processing
//        npx tsx scripts/analyze-kandy-templates.ts --digital-products   # Kandy Digital Products book only
//        npx tsx scripts/analyze-kandy-templates.ts --digital-products --no-dedupe  # all rows (usually 3× per page)

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Load .env.local manually (no dotenv dependency)
// ---------------------------------------------------------------------------
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let val = trimmed.slice(eqIdx + 1);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;
const googleAiKey = process.env.GOOGLE_AI_STUDIO_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
if (!openrouterKey && !googleAiKey) {
  console.error('Missing OPENROUTER_API_KEY or GOOGLE_AI_STUDIO_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Inline extractAdPrompt (avoids path alias issues in standalone scripts)
// ---------------------------------------------------------------------------

const VISION_MODEL = 'google/gemini-2.5-flash';

const SYSTEM_PROMPT = `You are an expert advertising creative analyst. Analyze the provided ad image and extract a structured JSON schema that captures every reproducible design decision.

Return ONLY valid JSON matching this exact structure — no markdown, no explanation:

{
  "layout": {
    "textPosition": "Description of where text blocks sit",
    "imagePosition": "Where the primary image/visual sits",
    "ctaPosition": "Where the call-to-action button/text sits",
    "visualHierarchy": "Reading flow description"
  },
  "composition": {
    "backgroundType": "Describe the background",
    "overlayStyle": "Any overlay or filter applied",
    "borderTreatment": "Border or frame style"
  },
  "typography": {
    "headlineStyle": "Describe the headline typography",
    "subheadlineStyle": "Describe the subheadline/body typography",
    "ctaTextStyle": "Describe the CTA text style",
    "fontPairingNotes": "How the fonts relate"
  },
  "colorStrategy": {
    "dominantColors": ["3-5 prominent colors as descriptive names"],
    "contrastApproach": "How contrast is achieved",
    "accentUsage": "How accent color is used"
  },
  "imageryStyle": "One of: product_focused | lifestyle | abstract_tech | illustration | 3d_render | photography",
  "emotionalTone": "One of: urgency | trust | aspiration | exclusivity | social_proof | value",
  "ctaStyle": {
    "buttonShape": "CTA button shape description",
    "position": "CTA position on the ad",
    "textPattern": "CTA text pattern"
  },
  "contentBlocks": [
    {
      "type": "Type of block",
      "content": "Generic content description",
      "position": "Where on the ad this block sits"
    }
  ]
}

Important rules:
- Describe visual patterns generically — do NOT reference specific brand names, products, or copy
- Focus on STRUCTURAL and STYLISTIC decisions that can be replicated with different content
- The commercial subject in the image (e.g. clothing, food) may be arbitrary — describe it as "hero subject zone" or similar when layout matters more than that exact category
- Be precise about spatial relationships and proportions`;

async function extractAdPromptFromUrl(imageUrl: string): Promise<Record<string, unknown>> {
  // Download the image and convert to base64 for Gemini API
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString('base64');
  const mimeType = imageResponse.headers.get('content-type') || 'image/png';

  const geminiModel = 'gemini-2.5-flash';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${googleAiKey}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: SYSTEM_PROMPT + '\n\nAnalyze this ad image and extract the structured prompt schema.' },
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 4000,
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    throw new Error(`Gemini API error (${response.status}): ${errorBody.substring(0, 300)}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (!content) {
    throw new Error('Gemini returned empty response');
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response: ' + content.substring(0, 200));
  }

  // Clean up common JSON issues from LLM output
  let jsonStr = jsonMatch[0];
  // Remove trailing commas before } or ]
  jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
  // Remove any comments
  jsonStr = jsonStr.replace(/\/\/[^\n]*/g, '');

  return JSON.parse(jsonStr);
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        results[idx] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface TemplateRow {
  id: string;
  collection_name: string;
  page_index: number;
  image_url: string;
  vertical: string;
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

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const digitalProducts = args.includes('--digital-products');
  const noDedupe = args.includes('--no-dedupe');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;

  // Fetch templates missing prompt_schema
  let query = supabase
    .from('kandy_templates')
    .select('id, collection_name, page_index, image_url, vertical')
    .is('prompt_schema', null)
    .eq('is_active', true)
    .order('collection_name')
    .order('page_index')
    .order('id');

  if (digitalProducts) {
    query = query.or(
      'collection_name.ilike.Digital Products%,source_brand.eq."Kandy - Digital Products"',
    );
  }

  /** Dedupe needs full row set from DB; apply --limit after dedupe. */
  const limitAfterDedupe = Boolean(digitalProducts && !noDedupe && limit);
  if (limit && !limitAfterDedupe) {
    query = query.limit(limit);
  }

  const { data: rawTemplates, error } = await query;

  if (error) {
    console.error('Failed to fetch templates:', error.message);
    process.exit(1);
  }

  let templates = rawTemplates as TemplateRow[] | null;
  if (digitalProducts && templates?.length && !noDedupe) {
    const before = templates.length;
    templates = dedupeByCollectionPage(templates);
    console.log(`Digital Products: ${before} rows → ${templates.length} unique pages (collection + page_index).`);
    if (limit) {
      templates = templates.slice(0, limit);
      console.log(`After --limit ${limit}: ${templates.length} template(s) to analyze.`);
    }
  }

  if (!templates || templates.length === 0) {
    console.log('No templates found with missing prompt_schema. All done!');
    return;
  }

  console.log(`Found ${templates.length} templates to analyze.`);

  if (isDryRun) {
    for (const t of templates as TemplateRow[]) {
      console.log(`  [${t.collection_name}] page ${t.page_index} — ${t.vertical} — ${t.id}`);
    }
    console.log(`\nDry run complete. Run without --dry-run to process.`);
    return;
  }

  let succeeded = 0;
  let failed = 0;
  const total = templates.length;
  const CONCURRENCY = 2;
  const RETRY_DELAY_MS = 5000;

  await processWithConcurrency(
    templates as TemplateRow[],
    CONCURRENCY,
    async (template, index) => {
      const label = `[${index + 1}/${total}] ${template.collection_name} p${template.page_index}`;

      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          console.log(`Analyzing template ${index + 1}/${total}... (${template.collection_name} p${template.page_index})`);

          const promptSchema = await extractAdPromptFromUrl(template.image_url);

          // Infer ad_category from the analysis if possible
          // Valid values: product_hero, comparison, social_proof, sale_discount, feature_callout, lifestyle, testimonial, other
          const emotionalTone = (promptSchema as Record<string, unknown>).emotionalTone as string | undefined;
          const imageryStyle = (promptSchema as Record<string, unknown>).imageryStyle as string | undefined;
          const categoryMap: Record<string, string> = {
            urgency: 'sale_discount',
            trust: 'feature_callout',
            aspiration: 'lifestyle',
            exclusivity: 'product_hero',
            social_proof: 'social_proof',
            value: 'sale_discount',
          };
          const imageryMap: Record<string, string> = {
            product_focused: 'product_hero',
            lifestyle: 'lifestyle',
            abstract_tech: 'feature_callout',
            illustration: 'other',
            '3d_render': 'product_hero',
            photography: 'lifestyle',
          };
          const adCategory = emotionalTone
            ? categoryMap[emotionalTone] ?? (imageryStyle ? imageryMap[imageryStyle] ?? 'other' : 'other')
            : (imageryStyle ? imageryMap[imageryStyle] ?? 'other' : 'other');

          const { error: updateError } = await supabase
            .from('kandy_templates')
            .update({
              prompt_schema: promptSchema,
              ad_category: adCategory,
            })
            .eq('id', template.id);

          if (updateError) {
            console.error(`  ${label} — DB update failed: ${updateError.message}`);
            failed++;
          } else {
            succeeded++;
            console.log(`  ${label} — done (${emotionalTone} -> ${adCategory})`);
          }
          return template.id;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          if (message === 'RATE_LIMITED' && attempts < maxAttempts) {
            console.warn(`  ${label} — rate limited, retrying in ${RETRY_DELAY_MS / 1000}s... (attempt ${attempts}/${maxAttempts})`);
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            continue;
          }

          console.error(`  ${label} — failed: ${message}`);
          failed++;
          return null;
        }
      }
      return null;
    }
  );

  console.log('\n--- Analysis complete ---');
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Total:     ${total}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
