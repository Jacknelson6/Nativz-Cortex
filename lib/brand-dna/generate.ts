import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateBrandContext } from '@/lib/knowledge/brand-context';
import { syncBrandDNAToKnowledgeGraph } from './sync-to-graph';
import { crawlForBrandDNA } from './crawl';
import { extractColorPalette, extractFontFamilies, extractLogoUrls, detectDesignStyle } from './extract-visuals';
import { analyzeVerbalIdentity } from './analyze-verbal';
import { extractProductCatalog } from './extract-products';
import { compileBrandDocument } from './compile-document';
import type { BrandDNARawData, ProgressCallback } from './types';
import type { BrandLogo, BrandScreenshot } from '@/lib/knowledge/types';

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
    // Get client name
    const { data: client } = await admin
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .single();
    const clientName = client?.name ?? 'Unknown';

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

    await onProgress('analyzing', 50, 'Analyzing tone of voice...');

    // Step 3: Verbal identity analysis (AI)
    const verbalIdentity = await analyzeVerbalIdentity(pages);

    await onProgress('analyzing', 65, 'Building product catalog...');

    // Step 4: Product extraction (AI)
    const products = await extractProductCatalog(pages);

    await onProgress('compiling', 80, 'Compiling brand guideline...');

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
