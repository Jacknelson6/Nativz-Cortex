import type { OnScreenText } from '../types';

export type NanoBracketFill = {
  onScreenText: OnScreenText;
  productService: string;
  offer: string;
};

/**
 * Replace bracket placeholders in a Nano Banana verbatim template body.
 */
export function fillNanoBananaTemplate(template: string, fill: NanoBracketFill): string {
  const { headline, subheadline, cta } = fill.onScreenText;
  const offer = (fill.offer ?? '').trim();
  return template
    .replaceAll('[HEADLINE]', headline)
    .replaceAll('[SUBHEADLINE]', subheadline)
    .replaceAll('[CTA]', cta)
    .replaceAll('[OFFER]', offer)
    .replaceAll('[PRODUCT_SERVICE]', fill.productService.trim());
}
