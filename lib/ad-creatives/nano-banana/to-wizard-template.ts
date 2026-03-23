import type { AdCreativeTemplate, AdPromptSchema } from '../types';

const NANO_PLACEHOLDER_SCHEMA: AdPromptSchema = {
  layout: {
    textPosition: 'Per Nano Banana style directive',
    imagePosition: 'Per style',
    ctaPosition: 'Lower third or per style',
    visualHierarchy: 'Headline → visual → CTA',
  },
  composition: {
    backgroundType: 'Brand-appropriate',
    overlayStyle: 'Light if needed',
    borderTreatment: 'Per style',
  },
  typography: {
    headlineStyle: 'Per Nano style',
    subheadlineStyle: 'Supporting',
    ctaTextStyle: 'Button or pill',
    fontPairingNotes: 'Match brand DNA',
  },
  colorStrategy: {
    dominantColors: [],
    contrastApproach: 'Strong readability',
    accentUsage: 'CTA accent',
  },
  imageryStyle: 'photography',
  emotionalTone: 'trust',
  ctaStyle: {
    buttonShape: 'Rounded',
    position: 'Bottom',
    textPattern: 'Action-oriented',
  },
  contentBlocks: [],
};

export type NanoCatalogListItem = {
  slug: string;
  name: string;
  sortOrder: number;
  nanoType: string;
  previewUrl: string;
};

/** Shape `VariationStrip` / wizard summary expect from `AdCreativeTemplate`. */
export function nanoCatalogItemToWizardTemplate(item: NanoCatalogListItem): AdCreativeTemplate {
  return {
    id: item.slug,
    collection_name: item.name,
    canva_design_id: `nano-banana:${item.slug}`,
    page_index: item.sortOrder,
    image_url: item.previewUrl,
    prompt_schema: NANO_PLACEHOLDER_SCHEMA,
    vertical: 'ecommerce',
    format: 'feed',
    ad_category: 'promotional',
    aspect_ratio: '1:1',
    is_favorite: false,
    is_active: true,
    created_at: new Date().toISOString(),
    source_brand: item.nanoType,
  };
}
