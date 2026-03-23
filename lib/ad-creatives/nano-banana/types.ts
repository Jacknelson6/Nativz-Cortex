// ---------------------------------------------------------------------------
// Nano Banana — global template catalog (admin static ad wizard)
// ---------------------------------------------------------------------------

export const NANO_BANANA_TYPE_GROUPS = [
  'headline_hero',
  'social_proof',
  'ugc_native',
  'promo_offer',
  'comparison',
  'editorial',
  'faux_ui',
  'experimental',
] as const;

export type NanoBananaTypeGroup = (typeof NANO_BANANA_TYPE_GROUPS)[number];

export type NanoBananaCatalogEntry = {
  sortOrder: number;
  slug: string;
  name: string;
  nanoType: NanoBananaTypeGroup;
  /** Public path under `/public` (file may be added later). */
  previewPublicPath: string;
  /**
   * Verbatim-style body with bracket placeholders:
   * [HEADLINE] [SUBHEADLINE] [CTA] [OFFER] [PRODUCT_SERVICE]
   */
  promptTemplate: string;
};
