import type { BrandContext } from '@/lib/knowledge/brand-context';

export const BRAND_DNA_REQUIRED_MESSAGE =
  'Brand DNA is required before generating ads. In Admin, open this client → Brand DNA, generate from the website URL, wait until it is ready, then try again. If the site URL changed, refresh Brand DNA for the new URL first.';

export class BrandDnaRequiredError extends Error {
  override name = 'BrandDnaRequiredError';
  constructor(message: string = BRAND_DNA_REQUIRED_MESSAGE) {
    super(message);
  }
}

/** Ensures prompts use compiled Brand DNA (`brand_guideline`), not only raw client profile fields. */
export function assertBrandDnaGuidelineForAdGeneration(brandContext: BrandContext): void {
  if (!brandContext.fromGuideline) {
    throw new BrandDnaRequiredError();
  }
}
