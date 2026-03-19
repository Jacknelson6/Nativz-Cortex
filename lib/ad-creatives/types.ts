// ---------------------------------------------------------------------------
// Static Ad Generation — Types & Constants
// ---------------------------------------------------------------------------

export const AD_VERTICALS = [
  'ecommerce',
  'saas',
  'local_service',
  'health_wellness',
  'finance',
  'education',
  'real_estate',
  'food_beverage',
  'fashion',
  'automotive',
] as const;

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

export const BATCH_STATUSES = [
  'pending',
  'generating',
  'completed',
  'failed',
  'partially_completed',
] as const;

export type AdVertical = (typeof AD_VERTICALS)[number];
export type AdCategory = (typeof AD_CATEGORIES)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number]['value'];
export type BatchStatus = (typeof BATCH_STATUSES)[number];

// ---------------------------------------------------------------------------
// JSON Schema Types (stored in jsonb columns)
// ---------------------------------------------------------------------------

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

export type ProductInfo = {
  name: string;
  imageUrl: string | null;
  description: string;
};

export type ProductOfferConfig = {
  product: ProductInfo;
  offer: string;
  cta: string;
};

export type AdGenerationConfig = {
  aspectRatio: AspectRatio;
  numVariations: number;
  productService: string;
  offer: string;
  onScreenText: OnScreenText | 'ai_generate';
  templateIds: string[];
  templateSource: 'kandy' | 'custom';
  /** Wizard-sourced product list (optional — backwards compatible) */
  products?: ProductOfferConfig[];
  /** Brand URL that was scraped for context */
  brandUrl?: string;
};

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------

export type KandyTemplate = {
  id: string;
  collection_name: string;
  canva_design_id: string;
  page_index: number;
  image_url: string;
  prompt_schema: AdPromptSchema;
  vertical: AdVertical;
  format: string;
  ad_category: AdCategory;
  aspect_ratio: AspectRatio;
  is_favorite: boolean;
  is_active: boolean;
  created_at: string;
};

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

export type AdGenerationBatch = {
  id: string;
  client_id: string;
  status: BatchStatus;
  config: AdGenerationConfig;
  total_count: number;
  completed_count: number;
  failed_count: number;
  brand_context_source: string;
  ephemeral_url: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
};

export type AdCreative = {
  id: string;
  batch_id: string;
  client_id: string;
  template_id: string;
  template_source: 'kandy' | 'custom';
  image_url: string;
  aspect_ratio: AspectRatio;
  prompt_used: string;
  on_screen_text: OnScreenText;
  product_service: string;
  offer: string;
  is_favorite: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};
