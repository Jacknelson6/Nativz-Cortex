import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateBrandContext } from '@/lib/knowledge/brand-context';
import { syncBrandDNAToKnowledgeGraph } from './sync-to-graph';
import { crawlForBrandDNA } from './crawl';
import { extractColorPalette, extractFontFamilies, extractLogoUrls, detectDesignStyle } from './extract-visuals';
import { analyzeVerbalIdentity } from './analyze-verbal';
import { extractAudienceBenchmarks } from './extract-audience-benchmarks';
import { extractProductCatalog } from './extract-products';
import { compileBrandDocument } from './compile-document';
import type { BrandDNARawData, ProgressCallback } from './types';
import type { BrandLogo, BrandScreenshot } from '@/lib/knowledge/types';
import { getClientAdGenerationSettings, upsertClientImagePromptModifier } from '@/lib/ad-creatives/client-ad-generation-settings';
import { generateImagePromptModifierFromDNA } from '@/lib/ad-creatives/generate-image-prompt-modifier';

/**
 * Orchestrate the full Brand DNA generation pipeline:
 * 1. Crawl website
 * 2. Extract colors, fonts, logos in parallel
 * 3. Analyze verbal identity
 * 4. Extract products
 * 5. Detect design style
 * 6. Compile into brand guideline document
 */
export async function generateBrandDNA(
  clientId: string,
  websiteUrl: string,
  options?: {
    uploadedContent?: string;
    onProgress?: ProgressCallback;
  },
): Promise<string> {
  const admin = createAdminClient();
  const onProgress = options?.onProgress ?? (async () => {});

  // Set client status to generating
  await admin
    .from('clients')
    .update({ brand_dna_status: 'generating' })
    .eq('id', clientId);

  try {
    const { data: clientRow } = await admin
      .from('clients')
      .select('name, industry')
      .eq('id', clientId)
      .single();
    const clientName = clientRow?.name ?? 'Unknown';
    const clientIndustry = typeof clientRow?.industry === 'string' ? clientRow.industry : '';

    // Step 1: Crawl
    await onProgress('crawling', 10, 'Crawling website...');
    const pages = await crawlForBrandDNA(websiteUrl, 30);

    if (pages.length === 0) {
      throw new Error('Could not crawl any pages from the provided URL');
    }

    await onProgress('extracting', 30, 'Extracting visual identity...');

    // Step 2: Extract visuals in parallel
    const [colors, fonts, logoRefs, designStyle] = await Promise.all([
      Promise.resolve(extractColorPalette(pages)),
      Promise.resolve(extractFontFamilies(pages)),
      Promise.resolve(extractLogoUrls(pages)),
      Promise.resolve(detectDesignStyle(pages)),
    ]);

    // Convert logo refs to BrandLogo format (URLs are external, no storage upload for now)
    const logos: BrandLogo[] = logoRefs.map((l) => ({
      url: l.url,
      variant: l.variant,
    }));

    // No screenshot capture in v1 — requires browser automation (Playwright/Puppeteer)
    const screenshots: BrandScreenshot[] = [];

    await onProgress('analyzing', 48, 'Analyzing tone of voice and catalog...');

    // Step 3–4: Verbal identity + product catalog (AI, parallel)
    const [verbalIdentity, products] = await Promise.all([
      analyzeVerbalIdentity(pages),
      extractProductCatalog(pages),
    ]);

    await onProgress('analyzing', 62, 'Defining ICPs and ad research peers...');

    const audienceBenchmarks = await extractAudienceBenchmarks({
      clientName,
      websiteUrl,
      pages,
      products,
      verbalIdentity,
      logoUrls: logoRefs.map((l) => l.url),
    });

    await onProgress('compiling', 78, 'Compiling brand guideline...');

    // Step 5: Compile everything into the brand guideline document
    const rawData: BrandDNARawData = {
      clientName,
      websiteUrl,
      pages,
      colors,
      fonts,
      logos,
      screenshots,
      products,
      designStyle,
      verbalIdentity,
      uploadedContent: options?.uploadedContent ?? null,
      audienceBenchmarks,
    };

    const compiled = await compileBrandDocument(rawData);

    // Step 6: Store as multi-node graph (replaces old single-entry creation)
    const { storeBrandDNANodes } = await import('./store-nodes');
    const stored = await storeBrandDNANodes(clientId, clientName, compiled);

    // Update client fields from extraction (backfill)
    const updateFields: Record<string, unknown> = {
      brand_dna_status: 'draft',
    };
    if (verbalIdentity?.tonePrimary) updateFields.brand_voice = verbalIdentity.tonePrimary;
    if (verbalIdentity?.targetAudienceSummary) updateFields.target_audience = verbalIdentity.targetAudienceSummary;
    if (colors.length > 0 || fonts.length > 0 || verbalIdentity) {
      const prefs: Record<string, unknown> = {};
      if (verbalIdentity?.voiceAttributes.length) prefs.tone_keywords = verbalIdentity.voiceAttributes;
      if (verbalIdentity?.messagingPillars.length) prefs.topics_lean_into = verbalIdentity.messagingPillars;
      if (verbalIdentity?.avoidancePatterns.length) prefs.topics_avoid = verbalIdentity.avoidancePatterns;
      if (Object.keys(prefs).length > 0) updateFields.preferences = prefs;
    }

    await admin
      .from('clients')
      .update(updateFields)
      .eq('id', clientId);

    // Invalidate cached brand context
    invalidateBrandContext(clientId);

    // Image prompt modifier — same run as DNA: uses `compiled` directly (no getBrandContext)
    try {
      const adSettings = await getClientAdGenerationSettings(clientId);
      const modifier = await generateImagePromptModifierFromDNA({
        advertisingType: adSettings.advertising_type,
        compiled,
        clientName,
        clientIndustry,
      });
      if (modifier) {
        await upsertClientImagePromptModifier({ clientId, imagePromptModifier: modifier });
      }
    } catch (modErr) {
      console.error('[brand-dna] image prompt modifier failed (non-fatal):', modErr);
    }

    // Sync hub to agency knowledge graph (non-fatal)
    try {
      await syncBrandDNAToKnowledgeGraph(clientId, clientName, compiled, websiteUrl);
    } catch (syncErr) {
      console.error('Brand DNA → Knowledge Graph sync failed (non-fatal):', syncErr);
    }

    await onProgress('completed', 100, 'Brand DNA complete');

    return stored.guidelineId;
  } catch (err) {
    // Reset status on failure
    await admin
      .from('clients')
      .update({ brand_dna_status: 'none' })
      .eq('id', clientId);

    throw err;
  }
}
