// ---------------------------------------------------------------------------
// Ad Creatives — Shared Types & Constants
// ---------------------------------------------------------------------------

export const AD_CATEGORIES = [
  'promotional',
  'brand_awareness',
  'product_showcase',
  'testimonial',
  'seasonal',
  'retargeting',
  'lead_generation',
  'event',
  'educational',
  'comparison',
] as const;

export const ASPECT_RATIOS = [
  { value: '1:1', width: 1080, height: 1080, label: 'Square' },
  { value: '4:5', width: 1080, height: 1350, label: 'Portrait' },
  { value: '9:16', width: 1080, height: 1920, label: 'Story / Reel' },
  { value: '16:9', width: 1920, height: 1080, label: 'Landscape' },
  { value: '1.91:1', width: 1200, height: 628, label: 'Facebook / Google' },
] as const;

export const ADVERTISING_TYPES = [
  'product_dtc',
  'saas_service',
  'marketplace',
  'local_service',
] as const;

export type AdCategory = (typeof AD_CATEGORIES)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number]['value'];
export type AdvertisingType = (typeof ADVERTISING_TYPES)[number];

export type AdPromptSchema = {
  layout: {
    textPosition: string;
    imagePosition: string;
    ctaPosition: string;
    visualHierarchy: string;
  };
  composition: {
    backgroundType: string;
    overlayStyle: string;
    borderTreatment: string;
  };
  typography: {
    headlineStyle: string;
    subheadlineStyle: string;
    ctaTextStyle: string;
    fontPairingNotes: string;
  };
  colorStrategy: {
    dominantColors: string[];
    contrastApproach: string;
    accentUsage: string;
  };
  imageryStyle:
    | 'product_focused'
    | 'lifestyle'
    | 'abstract_tech'
    | 'illustration'
    | '3d_render'
    | 'photography';
  emotionalTone:
    | 'urgency'
    | 'trust'
    | 'aspiration'
    | 'exclusivity'
    | 'social_proof'
    | 'value';
  ctaStyle: {
    buttonShape: string;
    position: string;
    textPattern: string;
  };
  contentBlocks: Array<{
    type: string;
    content: string;
    position: string;
  }>;
};

export type OnScreenText = {
  headline: string;
  subheadline: string;
  cta: string;
};

/** Reference template row stored in `ad_prompt_templates`. Used by the template library UI. */
export type AdPromptTemplate = {
  id: string;
  client_id: string;
  name: string;
  reference_image_url: string | null;
  prompt_schema: AdPromptSchema;
  aspect_ratio: AspectRatio;
  ad_category: AdCategory;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
};
