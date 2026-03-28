import type { OnScreenText } from '../types';

export type NanoBracketFill = {
  onScreenText: OnScreenText;
  productService: string;
  offer: string;
};

const BLANK_HEADLINE = '[LEAVE BLANK — text will be composited in post-production]';
const BLANK_SUB = '[LEAVE BLANK — text will be composited]';
const BLANK_CTA = '[LEAVE BLANK — button will be composited]';
const BLANK_OFFER = '[LEAVE BLANK]';

export type FillNanoBananaTemplateOptions = {
  /** When true, slots are replaced with explicit blank hints so Gemini does not render copy on canvas. */
  blankCopySlots?: boolean;
};

/**
 * Replace bracket placeholders in a Nano Banana verbatim template body.
 */
export function fillNanoBananaTemplate(
  template: string,
  fill: NanoBracketFill,
  options?: FillNanoBananaTemplateOptions,
): string {
  const { headline, subheadline, cta } = fill.onScreenText;
  const offer = (fill.offer ?? '').trim();
  const blank = options?.blankCopySlots === true;
  return template
    .replaceAll('[HEADLINE]', blank ? BLANK_HEADLINE : headline)
    .replaceAll('[SUBHEADLINE]', blank ? BLANK_SUB : subheadline)
    .replaceAll('[CTA]', blank ? BLANK_CTA : cta)
    .replaceAll('[OFFER]', blank ? BLANK_OFFER : offer)
    .replaceAll('[PRODUCT_SERVICE]', fill.productService.trim());
}
