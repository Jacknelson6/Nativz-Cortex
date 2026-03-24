import { createCompletion } from '@/lib/ai/client';
import { BRAND_DNA_AI_TIMEOUT_MS } from './constants';
import type { BrandDNARawData, CompiledBrandDNA } from './types';
import type { BrandGuidelineMetadata } from '@/lib/knowledge/types';
import { mergeProductAppendix } from './product-catalog-md';

/**
 * Compile all extracted Brand DNA data into a comprehensive markdown brand guideline.
 * Uses AI to write a polished, structured document from the raw extraction data.
 */
export async function compileBrandDocument(data: BrandDNARawData): Promise<CompiledBrandDNA> {
  const { colors, fonts, logos, products, designStyle, verbalIdentity, audienceBenchmarks } = data;

  // Build context for AI compilation
  const contextParts: string[] = [];

  contextParts.push(`Brand name: ${data.clientName}`);
  contextParts.push(`Website: ${data.websiteUrl}`);
  contextParts.push(`Pages crawled: ${data.pages.length}`);

  // Homepage content for overview
  const homepage = data.pages.find((p) => p.pageType === 'homepage');
  const aboutPage = data.pages.find((p) => p.pageType === 'about');
  if (homepage) contextParts.push(`\nHomepage content:\n${homepage.content.slice(0, 3000)}`);
  if (aboutPage) contextParts.push(`\nAbout page content:\n${aboutPage.content.slice(0, 3000)}`);

  if (colors.length > 0) {
    contextParts.push(`\nExtracted colors: ${colors.map((c) => `${c.hex} (${c.role})`).join(', ')}`);
  }
  if (fonts.length > 0) {
    contextParts.push(`Extracted fonts: ${fonts.map((f) => `${f.family} (${f.role})`).join(', ')}`);
  }
  if (designStyle) {
    contextParts.push(`Design style: ${designStyle.theme} theme, ${designStyle.corners} corners, ${designStyle.density} density, ${designStyle.imagery} imagery`);
  }
  if (verbalIdentity) {
    contextParts.push(`\nTone: ${verbalIdentity.tonePrimary}`);
    contextParts.push(`Voice attributes: ${verbalIdentity.voiceAttributes.join(', ')}`);
    contextParts.push(`Messaging pillars: ${verbalIdentity.messagingPillars.join(', ')}`);
    contextParts.push(`Target audience: ${verbalIdentity.targetAudienceSummary}`);
    contextParts.push(`Competitive positioning: ${verbalIdentity.competitivePositioning}`);
    if (verbalIdentity.vocabularyPatterns.length > 0) {
      contextParts.push(`Vocabulary: ${verbalIdentity.vocabularyPatterns.join(', ')}`);
    }
    if (verbalIdentity.avoidancePatterns.length > 0) {
      contextParts.push(`Avoidance patterns: ${verbalIdentity.avoidancePatterns.join(', ')}`);
    }
  }
  if (products.length > 0) {
    const categories = [...new Set(products.map((p) => p.category?.trim() || 'General'))];
    const catPreview = categories.slice(0, 10).join(', ') + (categories.length > 10 ? ', …' : '');
    const typeHint = [...new Set(products.map((p) => p.offeringType ?? 'unspecified'))].join(', ');
    contextParts.push(
      `\nStructured product catalog: ${products.length} items in ${categories.length} categories (${catPreview}). Offering types present: ${typeHint}. ` +
        'Separate affiliate/ambassador programs from core products/services in narrative. Full list with images is in the appendix.',
    );
  }
  if (logos.length > 0) {
    contextParts.push(`\nExtracted logo assets:\n${logos.map((l) => `- ${l.variant}: ${l.url}`).join('\n')}`);
  }
  if (audienceBenchmarks?.idealCustomerProfiles?.length) {
    contextParts.push(
      '\n## Five ICPs (authoritative — summarize in prose, do not drop segments)\n' +
        audienceBenchmarks.idealCustomerProfiles
          .map(
            (icp, i) =>
              `### ICP ${i + 1}: ${icp.label}\n${icp.summary}` +
              (icp.demographics ? `\nDemographics: ${icp.demographics}` : '') +
              (icp.pain_points?.length ? `\nPain points: ${icp.pain_points.join('; ')}` : '') +
              (icp.goals?.length ? `\nGoals: ${icp.goals.join('; ')}` : '') +
              (icp.preferred_channels?.length ? `\nChannels: ${icp.preferred_channels.join(', ')}` : '') +
              (icp.buying_signals?.length ? `\nBuying signals: ${icp.buying_signals.join('; ')}` : ''),
          )
          .join('\n\n'),
    );
  }
  if (audienceBenchmarks?.similarBrandsForAds?.length) {
    contextParts.push(
      '\nBrands to study in Meta Ad Library (static/image creative patterns):\n' +
        audienceBenchmarks.similarBrandsForAds
          .map((b) => `- **${b.name}** (${b.category}): ${b.why_similar}\n  Library: ${b.meta_ad_library_url}`)
          .join('\n'),
    );
  }
  if (audienceBenchmarks?.logoUsageSummary?.trim()) {
    contextParts.push(`\nLogo usage notes:\n${audienceBenchmarks.logoUsageSummary.trim()}`);
  }
  if (data.uploadedContent) {
    contextParts.push(`\nAdditional brand materials:\n${data.uploadedContent.slice(0, 3000)}`);
  }

  const systemPrompt = `You are a senior brand strategist creating a comprehensive brand guideline document. Using the data below, write a polished markdown document with these exact sections:

## Brand overview
3-4 paragraphs: who the brand is, what they do, why they matter, their mission/values. Write this like a brand brief, not a Wikipedia article.

## Visual identity
Document the brand's visual language: primary and secondary colors (reference hex codes), typography choices, logo description, and overall design philosophy (light/dark, minimal/rich, etc.).

## Verbal identity
Document how the brand communicates: tone of voice, messaging pillars, vocabulary patterns, what they avoid, and formality level. Include example phrases that capture their voice.

## Product catalog
2–4 short paragraphs only: how offerings are positioned, main categories, and representative examples. Do **not** enumerate every SKU or service — the full, editable list (names, descriptions, images, prices) is appended after your document as **Structured product catalog**.

## Target audience
Who the brand is talking to: demographics, psychographics, pain points, aspirations. Based on content language signals.

## Ideal customer profiles (ICPs)
Summarize each of the **five** structured ICPs from the data: one short subsection per ICP (label as heading). Reflect pain points, goals, channels, and buying signals.

## Competitive positioning
How the brand differentiates itself. What makes them unique in their market.

## Logo assets
Describe available logo variants (from extracted URLs), contrast/light vs dark backgrounds, and follow the logo usage notes provided.

## Paid social creative references
Explain why studying the listed peer brands in **Meta Ad Library** is useful for this brand’s category (static and image ads). Name each reference brand and what to look for — do not claim endorsement.

## Content style guide
Recommended content formats, platforms, and approach based on the brand's identity. This should guide content creators working with this brand.

Rules:
- Write in third person ("The brand..." not "Your brand...")
- Be specific and actionable, not generic
- Reference actual data from the extraction (real color codes, real product names, real phrases). For products, reference themes and categories — not an exhaustive list
- Keep total length under 3000 words
- Output ONLY the markdown document. No preamble or closing notes.`;

  const result = await createCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contextParts.join('\n') },
    ],
    maxTokens: 6000,
    feature: 'brand_dna_compile',
    timeoutMs: BRAND_DNA_AI_TIMEOUT_MS,
  });

  const content = mergeProductAppendix(result.text, products);

  // Build metadata sidecar
  const metadata: BrandGuidelineMetadata = {
    colors: colors,
    fonts: fonts,
    logos: logos.map((l) => ({ url: l.url, variant: l.variant })),
    screenshots: data.screenshots,
    products: products,
    design_style: designStyle,
    messaging_pillars: verbalIdentity?.messagingPillars ?? [],
    tone_primary: verbalIdentity?.tonePrimary ?? null,
    voice_attributes: verbalIdentity?.voiceAttributes ?? [],
    vocabulary_patterns: verbalIdentity?.vocabularyPatterns ?? [],
    avoidance_patterns: verbalIdentity?.avoidancePatterns ?? [],
    target_audience_summary: verbalIdentity?.targetAudienceSummary ?? null,
    competitive_positioning: verbalIdentity?.competitivePositioning ?? null,
    ideal_customer_profiles: audienceBenchmarks?.idealCustomerProfiles?.length
      ? audienceBenchmarks.idealCustomerProfiles
      : undefined,
    similar_brands_for_ads: audienceBenchmarks?.similarBrandsForAds?.length
      ? audienceBenchmarks.similarBrandsForAds
      : undefined,
    logo_usage_summary: audienceBenchmarks?.logoUsageSummary?.trim()
      ? audienceBenchmarks.logoUsageSummary.trim()
      : null,
    generated_from: data.pages.map((p) => p.url),
    version: 1,
  };

  return { content, metadata };
}
