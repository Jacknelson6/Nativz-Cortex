import type { BrandContext } from '@/lib/knowledge/brand-context';
import type { AspectRatio } from '../types';
import { ASPECT_RATIOS } from '../types';
import { resolveBrandStyleAppendix } from '../gemini-static-ad-prompt';

export function buildNanoBananaImagePrompt(params: {
  imagePromptModifier: string;
  brandContext: BrandContext;
  filledTemplateBody: string;
  aspectRatio: AspectRatio;
  productService: string;
  offer: string | null;
  creativeBrief?: string;
  styleDirection?: string;
}): string {
  const {
    imagePromptModifier,
    brandContext,
    filledTemplateBody,
    aspectRatio,
    productService,
    offer,
    creativeBrief,
    styleDirection,
  } = params;

  const dimensions = ASPECT_RATIOS.find((r) => r.value === aspectRatio) ?? ASPECT_RATIOS[0];
  const appendix = resolveBrandStyleAppendix(brandContext);

  const sections: string[] = [];

  sections.push(
    `Create one professional static advertisement image at ${dimensions.width}x${dimensions.height}px (${aspectRatio}). ` +
      'All typography, hero, CTA, and offer line must appear in this single frame — no follow-up compositing.',
  );

  if (imagePromptModifier.trim()) {
    sections.push(`CLIENT IMAGE MODIFIER (apply globally):\n${imagePromptModifier.trim()}`);
  } else {
    sections.push(
      `DEFAULT NANO BANANA BASELINE (no client image modifier set — apply anyway):\n` +
        `- Product reference photos are the source of truth for hero product appearance (same SKU, packaging, printed graphics).\n` +
        `- Product-forward composition: hero product roughly 60–75% of visual interest unless the template explicitly calls for a different layout.\n` +
        `- One headline, one subheadline, one CTA control; clean editorial hierarchy.`,
    );
  }

  const isGoldback = brandContext.clientName.trim().toLowerCase() === 'goldback';
  if (isGoldback) {
    sections.push(
      `GOLDBACK COPY + LOGO RULE (mandatory):\n` +
        `- Render the subheadline as EXACTLY the quoted Subheadline string from the template — same words, same order. Do not swap in art-direction, layout notes, or paraphrases from elsewhere in this prompt.\n` +
        `- Forbidden on the image (even as “subhead”): phrases about crops, splits, layouts, anchors, references, heroes, paragraphs, “minimal type”, “maximum metal”, “tight product”, “visual weight”, or any sentence that reads like a designer brief.\n` +
        `- Product/service summary and CLIENT IMAGE MODIFIER are instructions for you only — never paste them as visible customer copy.\n` +
        `- Do not paint the “Product/service focus:” paragraph from the template onto the artwork; treat it as metadata. Visible marketing lines = headline + subheadline + CTA button (+ offer only if non-empty).\n` +
        `- Logo: reproduce the Goldback identity only as printed on the supplied note (GB seal, on-note wordmark, artwork). Do not invent an extra logo lockup, red “GOLD” badge, boxed sticker, or alternate monogram beside the bill.\n` +
        `GOLDBACK COLOR-RULE (mandatory):\n` +
        `- Hex codes and named brand swatches in the modifier exist ONLY so you match paint in the scene. They are NOT content to show the viewer.\n` +
        `- Do NOT draw a bottom bar, footer strip, legend, or “palette” row of color blocks with names or codes.\n` +
        `- Do NOT render any substring that looks like a hex color token (hash mark + six hexadecimal digits) anywhere on the advertisement.\n` +
        `- Do NOT label colors on-canvas (e.g. “CREAM”, “MARIGOLD”) unless those words appear verbatim inside the approved headline/subheadline copy.`,
    );
  }

  sections.push(`BRAND CONTEXT:\n${brandContext.toPromptBlock()}`);

  if (creativeBrief?.trim()) {
    sections.push(creativeBrief.trim());
  }

  if (appendix?.trim()) {
    sections.push(appendix.trim());
  }

  if (styleDirection?.trim()) {
    sections.push(`SLOT STYLE DIRECTION:\n${styleDirection.trim()}`);
  }

  sections.push(`NANO BANANA TEMPLATE (filled):\n${filledTemplateBody}`);

  sections.push(
    `GLOBAL CONSTRAINTS:\n` +
      `- Product/service summary (context for you — do not render as ad copy unless a template line explicitly asks for it): ${productService.trim()}` +
      (offer?.trim() ? `\n- Offer context: ${offer.trim()}` : '') +
      `\n- No layout reference image is attached for this style — do not imitate unrelated template brands.` +
      `\n- VERBATIM ON-CANVAS COPY: Headline, subheadline, and CTA must match the quoted strings in the filled template exactly — same words, same order, same spelling. Do not invent, shorten, translate, or paraphrase them. Do not repeat any of those lines elsewhere (no echo in stickers, watermarks, device screens, or a second headline band).` +
      `\n- SINGLE INSTANCE: Each approved line (headline, subheadline, CTA, offer if any) appears exactly once in the composition. No duplicated sentences, stutter, or mirrored type.` +
      `\n- TYPOGRAPHY: Use clean, high-contrast lettering. If space is tight, simplify background or scale type — never warp, squeeze, or clip mid-glyph. No deformed or illegible characters.` +
      `\n- PRODUCT REFERENCE (when product images are supplied to the model before this text): The hero product must stay the same real SKU as the reference — same printed graphics, packaging shape, colors, and on-product marks. Lighting, depth, and modest camera angle changes are allowed like a new studio photo; do not redraw a different variant, merge two products, or replace artwork on the product surface.` +
      `\n- Use only the quoted headline, subheadline, and CTA for marketing copy; no hashtags, URL footers, or extra marketing paragraphs beyond what the template slot allows.` +
      `\n- Render the quoted CTA as exactly one primary **button** (pill or rectangle); the label must match the CTA string verbatim. No secondary CTAs or duplicate buttons.` +
      `\n- Avoid fake SaaS UI, dashboards, SOAP/medical charts, and social-post chrome unless the product is literally that.`,
  );

  const verbal = brandContext.verbalIdentity;
  const colorHint =
    brandContext.visualIdentity.colors.length > 0
      ? brandContext.visualIdentity.colors
          .slice(0, 5)
          .map((c) => `${c.name ?? c.role ?? 'color'}: ${c.hex}`)
          .join('; ')
      : '';
  const voiceHint = [
    verbal.tonePrimary?.trim() ? `Primary tone: ${verbal.tonePrimary.trim()}` : null,
    verbal.voiceAttributes.length > 0 ? `Voice traits: ${verbal.voiceAttributes.slice(0, 6).join('; ')}` : null,
    verbal.messagingPillars.length > 0 ? `Pillars: ${verbal.messagingPillars.slice(0, 4).join('; ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const audienceHint = brandContext.audience.summary?.trim().slice(0, 360) ?? '';

  sections.push(
    `BRAND OVERRIDES (mandatory — wins over any example style in the template above):\n` +
      `- Advertiser: "${brandContext.clientName}" in industry "${brandContext.clientIndustry.trim() || 'general'}". ` +
      `Hero, setting, props, and mood must fit this industry (e.g. home services → homes, craftsmanship, regional trust; not unrelated SaaS dashboards or fashion retail).\n` +
      (voiceHint ? `- Voice for mood and casting (do not paste as extra on-image copy):\n${voiceHint}\n` : '') +
      (audienceHint ? `- Who we are speaking to: ${audienceHint}${brandContext.audience.summary && brandContext.audience.summary.length > 360 ? '…' : ''}\n` : '') +
      (colorHint ? `- Prefer this brand palette in UI accents and background harmony: ${colorHint}\n` : '') +
      `- Do not invent a different company, category, or generic "tech startup" look when the industry is local services, retail, or trades.`,
  );

  if (isGoldback) {
    sections.push(
      `FINAL CHECK (Goldback): The export must not include a color-bar footer, swatch legend, or any visible #RRGGBB text. Colors are environmental paint only.`,
    );
  }

  return sections.join('\n\n');
}
