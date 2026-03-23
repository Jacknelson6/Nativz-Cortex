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
      `- Product/service summary: ${productService.trim()}` +
      (offer?.trim() ? `\n- Offer context: ${offer.trim()}` : '') +
      `\n- No layout reference image is attached for this style — do not imitate unrelated template brands.` +
      `\n- Use only the quoted headline, subheadline, and CTA; no extra buttons, hashtags, or URL footers.` +
      `\n- Avoid fake SaaS UI, dashboards, SOAP/medical charts, and social-post chrome unless the product is literally that.`,
  );

  return sections.join('\n\n');
}
