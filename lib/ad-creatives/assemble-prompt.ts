import type { BrandContext } from '@/lib/knowledge/brand-context';
import type { AdPromptSchema, OnScreenText, AspectRatio } from './types';
import { ASPECT_RATIOS } from './types';

interface AssemblePromptConfig {
  brandContext: BrandContext;
  promptSchema: AdPromptSchema;
  productService: string;
  offer: string | null;
  onScreenText: OnScreenText;
  aspectRatio: AspectRatio;
}

export function assembleImagePrompt(config: AssemblePromptConfig): string {
  const { brandContext, promptSchema, productService, offer, onScreenText, aspectRatio } = config;

  const dimensions = ASPECT_RATIOS.find((r) => r.value === aspectRatio) ?? ASPECT_RATIOS[0];
  const vi = brandContext.visualIdentity;
  const verbal = brandContext.verbalIdentity;

  const brandColors = vi.colors.length > 0
    ? vi.colors.map((c) => `${c.name ?? c.role}: ${c.hex}`).join(', ')
    : promptSchema.colorStrategy.dominantColors.join(', ');

  const fontDescription = vi.fonts.length > 0
    ? vi.fonts.map((f) => `${f.role ?? 'body'}: ${f.family}${f.weight ? ` (${f.weight})` : ''}`).join('; ')
    : null;

  const sections: string[] = [];

  sections.push(
    `Create a professional static advertisement image at ${dimensions.width}x${dimensions.height}px (${aspectRatio} aspect ratio).`
  );

  sections.push(
    `Product/Service: ${productService}` +
      (offer ? `\nSpecial offer: ${offer}` : '')
  );

  // Layout
  sections.push(
    `LAYOUT:\n` +
      `- Text placement: ${promptSchema.layout.textPosition}\n` +
      `- Primary visual placement: ${promptSchema.layout.imagePosition}\n` +
      `- CTA placement: ${promptSchema.layout.ctaPosition}\n` +
      `- Visual hierarchy / reading flow: ${promptSchema.layout.visualHierarchy}`
  );

  // Composition
  sections.push(
    `COMPOSITION:\n` +
      `- Background: ${promptSchema.composition.backgroundType}\n` +
      `- Overlay: ${promptSchema.composition.overlayStyle}\n` +
      `- Border treatment: ${promptSchema.composition.borderTreatment}`
  );

  // Typography
  const typo = promptSchema.typography;
  let typoSection =
    `TYPOGRAPHY:\n` +
    `- Headline style: ${typo.headlineStyle}\n` +
    `- Subheadline style: ${typo.subheadlineStyle}\n` +
    `- CTA text style: ${typo.ctaTextStyle}\n` +
    `- Font pairing: ${typo.fontPairingNotes}`;

  if (fontDescription) {
    typoSection += `\n- Brand fonts to use: ${fontDescription}`;
  }
  sections.push(typoSection);

  // Colors
  sections.push(
    `COLOR PALETTE:\n` +
      `- Brand colors (use these): ${brandColors}\n` +
      `- Contrast approach: ${promptSchema.colorStrategy.contrastApproach}\n` +
      `- Accent usage: ${promptSchema.colorStrategy.accentUsage}`
  );

  // Imagery
  sections.push(`IMAGERY STYLE: ${promptSchema.imageryStyle.replace(/_/g, ' ')}`);

  // Emotional tone
  sections.push(`EMOTIONAL TONE: ${promptSchema.emotionalTone.replace(/_/g, ' ')}`);

  // CTA
  sections.push(
    `CTA BUTTON:\n` +
      `- Shape: ${promptSchema.ctaStyle.buttonShape}\n` +
      `- Position: ${promptSchema.ctaStyle.position}`
  );

  // On-screen text — Gemini renders these matching the template layout
  sections.push(
    `EXACT TEXT TO RENDER ON THE IMAGE:\n` +
      `- Headline: "${onScreenText.headline}"\n` +
      `- Subheadline: "${onScreenText.subheadline}"\n` +
      `- CTA button text: "${onScreenText.cta}"` +
      (offer ? `\n- Offer text: "${offer}"` : '') +
      `\n- Do NOT render any brand name or logo — the logo will be added separately in post-processing`
  );

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Text-free variant — for post-processing pipeline
// ---------------------------------------------------------------------------

interface AssembleTextFreePromptConfig {
  brandContext: BrandContext;
  promptSchema: AdPromptSchema;
  productService: string;
  offer: string | null;
  aspectRatio: AspectRatio;
  textLayout: 'top' | 'center' | 'bottom';
}

/**
 * Generate a prompt that tells Gemini to produce a text-free base image.
 * Text, logos, and CTA buttons will be composited in post-processing.
 */
export function assembleImagePromptTextFree(config: AssembleTextFreePromptConfig): string {
  const { brandContext, promptSchema, productService, offer, aspectRatio, textLayout } = config;

  const dimensions = ASPECT_RATIOS.find((r) => r.value === aspectRatio) ?? ASPECT_RATIOS[0];
  const vi = brandContext.visualIdentity;
  const verbal = brandContext.verbalIdentity;

  const brandColors = vi.colors.length > 0
    ? vi.colors.map((c) => `${c.name ?? c.role}: ${c.hex}`).join(', ')
    : promptSchema.colorStrategy.dominantColors.join(', ');

  const sections: string[] = [];

  sections.push(
    `Create a professional static advertisement base image at ${dimensions.width}x${dimensions.height}px (${aspectRatio} aspect ratio).`
  );

  sections.push(
    `Product/Service: ${productService}` +
      (offer ? `\nSpecial offer context: ${offer}` : '')
  );

  // Layout
  sections.push(
    `LAYOUT:\n` +
      `- Primary visual placement: ${promptSchema.layout.imagePosition}\n` +
      `- Visual hierarchy / reading flow: ${promptSchema.layout.visualHierarchy}`
  );

  // Composition
  sections.push(
    `COMPOSITION:\n` +
      `- Background: ${promptSchema.composition.backgroundType}\n` +
      `- Overlay: ${promptSchema.composition.overlayStyle}\n` +
      `- Border treatment: ${promptSchema.composition.borderTreatment}`
  );

  // Colors
  sections.push(
    `COLOR PALETTE:\n` +
      `- Brand colors (use these): ${brandColors}\n` +
      `- Contrast approach: ${promptSchema.colorStrategy.contrastApproach}\n` +
      `- Accent usage: ${promptSchema.colorStrategy.accentUsage}`
  );

  // Imagery
  sections.push(`IMAGERY STYLE: ${promptSchema.imageryStyle.replace(/_/g, ' ')}`);

  // Emotional tone
  sections.push(`EMOTIONAL TONE: ${promptSchema.emotionalTone.replace(/_/g, ' ')}`);

  // Text-free zone — critical instructions
  sections.push(
    `ABSOLUTELY NO TEXT:\n` +
      `- This image must contain ZERO text — no words, letters, numbers, labels, watermarks, logos, buttons, or UI elements\n` +
      `- No brand names anywhere on the image\n` +
      `- No arrows with labels, no callout text, no price tags, no "shop now" buttons\n` +
      `- The ${textLayout} ~40% of the image should have a slightly darker/muted area or natural negative space where text will be overlaid later\n` +
      `- Think of this as a background plate for a graphic designer to add typography on top\n` +
      `- The product imagery should be the ONLY visual content — beautifully composed, well-lit, on-brand colors`
  );

  // Content blocks (visual ones only)
  if (promptSchema.contentBlocks.length > 0) {
    const visualBlocks = promptSchema.contentBlocks.filter(
      (b) => b.type !== 'text' && b.type !== 'headline' && b.type !== 'cta',
    );
    if (visualBlocks.length > 0) {
      const blocks = visualBlocks
        .map((b) => `- [${b.type}] ${b.content} (position: ${b.position})`)
        .join('\n');
      sections.push(`VISUAL CONTENT BLOCKS:\n${blocks}`);
    }
  }

  // Brand voice guidance
  if (verbal.tonePrimary) {
    sections.push(`BRAND VOICE (for mood/atmosphere): ${verbal.tonePrimary}`);
  }

  // Design style
  if (vi.designStyle) {
    const ds = vi.designStyle;
    sections.push(
      `BRAND DESIGN STYLE:\n` +
        `- Theme: ${ds.theme}\n` +
        `- Corners: ${ds.corners}\n` +
        `- Density: ${ds.density}\n` +
        `- Imagery preference: ${ds.imagery}`
    );
  }

  // Product context
  sections.push(
    `PRODUCT CONTEXT:\n` +
      `- The advertised product/service is: ${productService}\n` +
      `- Use ACTUAL product photos provided as reference images — do not generate imaginary products\n` +
      `- Focus on compelling visual composition that showcases the product/service`
  );

  sections.push(
    `CRITICAL RULES — MUST FOLLOW:\n` +
      `1. ZERO TEXT on the image. Not one single letter, number, word, or symbol. No exceptions.\n` +
      `2. ZERO logos, brand marks, watermarks, labels, stickers, or badges.\n` +
      `3. ZERO UI elements — no buttons, arrows, callout boxes, price tags, or star ratings.\n` +
      `4. Use the ACTUAL product photos provided as reference — match their real appearance exactly.\n` +
      `5. Beautiful, clean product photography composition with intentional negative space for later text overlay.\n` +
      `6. The ${textLayout} portion should subtly darken or have natural shadow — this is where text goes later.`
  );

  return sections.join('\n\n');
}
