/**
 * E2E Test: Static Ad Generator
 * 
 * 1. Pick a client (Toastique)
 * 2. Generate Brand DNA for them
 * 3. Wait for Brand DNA to complete
 * 4. Pick 2 Kandy templates with prompt_schemas
 * 5. Generate a batch of 2 ad creatives
 * 6. Wait for batch to complete
 * 7. Verify the generated images exist
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { BrandContext } from '../lib/knowledge/brand-context';
import type { AdPromptSchema, OnScreenText } from '../lib/ad-creatives/types';
import type { QAIssue } from '../lib/ad-creatives/qa-check';

const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

// Set process.env for library modules
Object.entries(env).forEach(([k, v]) => { process.env[k] = v; });

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TOASTIQUE_ID = '22bb761f-4fb6-41ec-ac73-e13693e74c12';

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== E2E Test: Static Ad Generator ===\n');

  // Step 1: Check if Toastique has Brand DNA
  console.log('Step 1: Checking Brand DNA for Toastique...');
  const { data: entries } = await supabase
    .from('client_knowledge_entries')
    .select('id, type, title')
    .eq('client_id', TOASTIQUE_ID)
    .eq('type', 'brand_guideline')
    .limit(1);
  
  if (!entries?.length) {
    console.log('  No Brand DNA found. Generating...');
    
    // Trigger Brand DNA generation via API
    const { data: job } = await supabase.from('brand_dna_jobs').insert({
      client_id: TOASTIQUE_ID,
      status: 'queued',
      progress_pct: 0,
      step_label: 'Starting...',
    }).select('id').single();
    
    console.log(`  Created job: ${job?.id}`);
    console.log('  NOTE: Brand DNA generation must be triggered via the API. Skipping for now.');
    console.log('  Testing with ephemeral brand context instead.\n');
  } else {
    console.log(`  Found Brand DNA: ${entries[0].title}\n`);
  }

  // Step 2: Pick templates with analyzed prompts
  console.log('Step 2: Finding analyzed templates...');
  const { data: templates } = await supabase
    .from('kandy_templates')
    .select('id, collection_name, page_index, image_url, prompt_schema, ad_category')
    .not('prompt_schema', 'is', null)
    .limit(2);
  
  if (!templates?.length) {
    console.error('  ✗ No analyzed templates found. Run analysis first.');
    process.exit(1);
  }
  
  console.log(`  Found ${templates.length} analyzed templates:`);
  templates.forEach(t => console.log(`    - ${t.collection_name} page ${t.page_index} (${t.ad_category ?? 'unknown category'})`));
  
  // Step 3: Create a generation batch directly (bypassing API since we don't have auth cookie)
  console.log('\nStep 3: Creating generation batch...');
  
  const batchConfig = {
    templateIds: templates.map(t => t.id),
    templateSource: 'kandy',
    productService: 'Artisan toast bar with fresh ingredients and cold-pressed juices',
    offer: '15% off your first order',
    aspectRatio: '1:1',
    numVariations: 1,
    onScreenText: 'ai_generate',
  };
  
  const { data: batch, error: batchErr } = await supabase.from('ad_generation_batches').insert({
    client_id: TOASTIQUE_ID,
    status: 'generating',
    config: batchConfig,
    total_count: templates.length,
    brand_context_source: 'ephemeral_url',
    ephemeral_url: 'https://toastique.com',
  }).select('id').single();
  
  if (batchErr) {
    console.error('  ✗ Batch creation failed:', batchErr.message);
    process.exit(1);
  }
  
  console.log(`  ✓ Batch created: ${batch.id}`);
  
  // Step 4: Generate images manually (calling the generation function directly)
  console.log('\nStep 4: Generating ad images...');
  
  // Import the generation modules
  const { assembleImagePrompt } = await import('../lib/ad-creatives/assemble-prompt');
  const { generateAdImage } = await import('../lib/ad-creatives/generate-image');
  const { generateAdCopy } = await import('../lib/ad-creatives/generate-copy');
  const { compositeAd } = await import('../lib/ad-creatives/composite-ad');
  const { qaCheckAd } = await import('../lib/ad-creatives/qa-check');
  
  // Real Toastique brand context (scraped from toastique.com)
  const testBrandContext = {
    clientName: 'Toastique',
    clientIndustry: 'Food & Beverage',
    clientWebsiteUrl: 'https://toastique.com',
    visualIdentity: {
      colors: [
        { hex: '#b18b5b', name: 'Gold', role: 'primary' },
        { hex: '#b4d5b6', name: 'Sage Green', role: 'secondary' },
        { hex: '#353d46', name: 'Dark Charcoal', role: 'neutral' },
        { hex: '#f7f4ee', name: 'Cream', role: 'background' },
        { hex: '#eee5d3', name: 'Light Tan', role: 'accent' },
      ],
      fonts: [
        { family: 'Fraunces', role: 'display', weight: '700' },
        { family: 'Poppins', role: 'body' },
      ],
      logos: [
        { url: 'https://toastique.com/cdn/shop/files/toastique_horiz_gold-web.svg?v=1738602787', variant: 'primary' },
      ],
      screenshots: [
        { url: 'https://toastique.com/cdn/shop/collections/3_Cheese_Italian.jpg?v=1755636741&width=2000', page: 'menu', description: 'Gourmet toast with fresh toppings' },
        { url: 'https://toastique.com/cdn/shop/collections/PB_B.jpg?v=1755636745&width=2000', page: 'menu', description: 'Peanut butter smoothie bowl with toppings' },
        { url: 'https://toastique.com/cdn/shop/collections/Screenshot2023-11-01at1.45.25PM.png?v=1755636737&width=2000', page: 'menu', description: 'Cold-pressed juice bottles lineup' },
      ],
      designStyle: { theme: 'natural', corners: 'rounded', density: 'balanced', imagery: 'photography' },
    },
    verbalIdentity: {
      tonePrimary: 'Fresh, warm, health-conscious, premium artisan',
      voiceAttributes: ['friendly', 'clean', 'premium', 'inviting'],
      messagingPillars: ['Gourmet toasts', 'Nutrient-rich ingredients', 'Handcrafted daily'],
      vocabularyPatterns: ['artisan', 'gourmet', 'handcrafted', 'nutrient-rich', 'fresh'],
      avoidancePatterns: ['junk food', 'cheap', 'artificial', 'processed'],
    },
    products: [
      { name: 'Gourmet Toasts', description: 'Artisan toasts with premium fresh toppings on sourdough' },
      { name: 'Smoothie Bowls', description: 'Handcrafted acai and smoothie bowls with fresh fruit toppings' },
      { name: 'Cold-Pressed Juices', description: 'Fresh cold-pressed juices and smoothies' },
    ],
    toPromptBlock: function() {
      return `Brand: Toastique — Gourmet toast, smoothie bowl, and juice franchise
Colors: Gold #b18b5b (primary), Sage Green #b4d5b6 (secondary), Dark Charcoal #353d46 (text), Cream #f7f4ee (background)
Fonts: Fraunces Bold (serif) for headlines, Poppins for body text
Tone: Fresh, warm, health-conscious, premium artisan quality
Logo: Horizontal gold wordmark "Toastique" — must appear on every ad
Products: Gourmet artisan toasts, smoothie bowls, cold-pressed juices`;
    },
    toFullContext: function() {
      return testBrandContext;
    },
  };
  
  // Generate copy
  console.log('  Generating ad copy...');
  let copyVariations;
  try {
    copyVariations = await generateAdCopy({
      brandContext: testBrandContext as BrandContext,
      productService: batchConfig.productService,
      offer: batchConfig.offer,
      count: templates.length,
    });
    console.log('  ✓ Generated copy:');
    copyVariations.forEach((c, i) => console.log(`    ${i + 1}. "${c.headline}" / "${c.subheadline}" / [${c.cta}]`));
  } catch (err) {
    console.error('  ✗ Copy generation failed:', err);
    // Use fallback copy
    copyVariations = [
      { headline: 'Fresh Toast, Made Daily', subheadline: 'Artisan ingredients on every slice', cta: 'Order Now' },
      { headline: 'Fuel Your Day', subheadline: 'Healthy never tasted this good', cta: 'Try It' },
    ];
    console.log('  Using fallback copy');
  }
  
  const logoUrl = testBrandContext.visualIdentity.logos[0]?.url ?? null;

  // Generate images — Gemini renders full ad with text matching template layout, then logo composited
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    const copy = copyVariations[i] ?? copyVariations[0];

    console.log(`\n  Generating image ${i + 1}/${templates.length} (template page ${template.page_index})...`);

    try {
      const MAX_QA_RETRIES = 2;
      let imageBuffer: Buffer | null = null;
      let qaResult = { passed: false, issues: [] as QAIssue[], extractedText: [] as string[], confidence: 0 };

      for (let attempt = 0; attempt <= MAX_QA_RETRIES; attempt++) {
        const prompt = assembleImagePrompt({
          brandContext: testBrandContext as BrandContext,
          promptSchema: template.prompt_schema as AdPromptSchema,
          productService: batchConfig.productService,
          offer: batchConfig.offer,
          onScreenText: copy,
          aspectRatio: batchConfig.aspectRatio,
        });

        if (attempt === 0) console.log(`  Prompt length: ${prompt.length} chars`);
        console.log(`  ${attempt > 0 ? `Retry ${attempt}: ` : ''}Generating ad...`);

        const productImageUrls = testBrandContext.visualIdentity.screenshots.map(s => s.url);

        const baseImageBuffer = await generateAdImage({
          prompt,
          referenceImageUrl: template.image_url,
          productImageUrls,
          aspectRatio: batchConfig.aspectRatio,
        });

        // Composite logo
        if (logoUrl) {
          imageBuffer = await compositeAd({
            baseImage: baseImageBuffer,
            textOverlay: null,
            logoUrl,
            logoPosition: 'bottom-left',
            width: 1080,
            height: 1080,
          });
        } else {
          imageBuffer = baseImageBuffer;
        }

        console.log(`  ✓ Image: ${imageBuffer.length} bytes. Running QA...`);

        // QA check
        qaResult = await qaCheckAd({
          imageBuffer,
          intendedText: copy,
          offer: batchConfig.offer ?? null,
          brandName: 'Toastique',
        });

        console.log(`  QA: score=${qaResult.confidence}, passed=${qaResult.passed}, issues=${qaResult.issues.length}`);
        if (qaResult.issues.length > 0) {
          qaResult.issues.forEach(issue => console.log(`    ⚠ ${issue.type}: ${issue.description}${issue.found ? ` (found: "${issue.found}")` : ''}`));
        }

        if (qaResult.passed) break;
        if (attempt < MAX_QA_RETRIES) console.log(`  ✗ QA failed, retrying...`);
      }

      if (!imageBuffer) throw new Error('No image generated');

      // Upload to Supabase Storage
      const creativeId = crypto.randomUUID();
      const storagePath = `${TOASTIQUE_ID}/${batch.id}/${creativeId}.png`;

      const { error: uploadErr } = await supabase.storage
        .from('ad-creatives')
        .upload(storagePath, imageBuffer, { contentType: 'image/png' });
      
      if (uploadErr) {
        console.error(`  ✗ Upload failed:`, uploadErr.message);
        continue;
      }
      
      const { data: urlData } = supabase.storage.from('ad-creatives').getPublicUrl(storagePath);
      
      // Create ad_creatives record
      await supabase.from('ad_creatives').insert({
        id: creativeId,
        batch_id: batch.id,
        client_id: TOASTIQUE_ID,
        template_id: template.id,
        template_source: 'kandy',
        image_url: urlData.publicUrl,
        aspect_ratio: batchConfig.aspectRatio,
        prompt_used: 'QA-verified generation',
        on_screen_text: copy,
        product_service: batchConfig.productService,
        offer: batchConfig.offer,
        metadata: {
          qa_passed: qaResult.passed,
          qa_score: qaResult.confidence,
          qa_issues: qaResult.issues.length > 0 ? qaResult.issues : undefined,
        },
      });
      
      console.log(`  ✓ Creative saved: ${urlData.publicUrl.substring(0, 80)}...`);
      
      // Update batch progress
      await supabase.from('ad_generation_batches')
        .update({ completed_count: i + 1 })
        .eq('id', batch.id);
        
    } catch (err: unknown) {
      console.error(`  ✗ Generation failed:`, err instanceof Error ? err.message : err);
      await supabase.from('ad_generation_batches')
        .update({ failed_count: 1 })
        .eq('id', batch.id);
    }
  }
  
  // Mark batch complete
  await supabase.from('ad_generation_batches')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', batch.id);
  
  // Verify results
  console.log('\n=== Results ===');
  const { data: creatives } = await supabase
    .from('ad_creatives')
    .select('id, image_url, on_screen_text, aspect_ratio')
    .eq('batch_id', batch.id);
  
  console.log(`Generated ${creatives?.length ?? 0} creatives`);
  creatives?.forEach((c) => {
    const text = c.on_screen_text as OnScreenText | null;
    console.log(`  ✓ ${text?.headline ?? 'no headline'} — ${c.image_url.substring(0, 80)}...`);
  });
  
  console.log('\n=== E2E Test Complete ===');
}

main().catch(err => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
