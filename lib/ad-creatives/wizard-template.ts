import { AD_CATEGORIES, type AdCategory, type AdPromptSchema, type AdPromptTemplate, type AdVertical, type KandyTemplate } from './types';

const DEFAULT_CUSTOM_VERTICAL: AdVertical = 'ecommerce';

/** Minimal schema so assembleImagePrompt does not crash before vision extraction finishes. */
const PENDING_SCHEMA: AdPromptSchema = {
  layout: {
    textPosition: 'Upper area — match reference ad balance',
    imagePosition: 'Center — hero visual',
    ctaPosition: 'Lower third',
    visualHierarchy: 'Headline → visual → CTA',
  },
  composition: {
    backgroundType: 'Clean, brand-appropriate',
    overlayStyle: 'Light if needed for legibility',
    borderTreatment: 'None or subtle',
  },
  typography: {
    headlineStyle: 'Bold, high contrast',
    subheadlineStyle: 'Supporting, readable',
    ctaTextStyle: 'Button or pill CTA',
    fontPairingNotes: 'Match reference ad style',
  },
  colorStrategy: {
    dominantColors: [],
    contrastApproach: 'Strong headline contrast',
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

function coerceAdCategory(value: unknown): AdCategory {
  if (typeof value === 'string' && (AD_CATEGORIES as readonly string[]).includes(value)) {
    return value as AdCategory;
  }
  return 'promotional';
}

export type WizardTemplate = KandyTemplate & { templateOrigin: 'kandy' | 'custom' };

export function withKandyOrigin(t: KandyTemplate): WizardTemplate {
  return { ...t, templateOrigin: 'kandy' };
}

/**
 * Map a client-scoped ad_prompt_templates row into the same shape the template grid uses for Kandy cards.
 */
/** Strip wizard-only field for APIs that expect `KandyTemplate`. */
export function wizardTemplateToKandy(t: WizardTemplate): KandyTemplate {
  const { templateOrigin: _o, ...rest } = t;
  return rest;
}

export function adPromptRowToWizardTemplate(row: AdPromptTemplate): WizardTemplate {
  const schema =
    row.prompt_schema &&
    typeof row.prompt_schema === 'object' &&
    Object.keys(row.prompt_schema as object).length > 0
      ? (row.prompt_schema as AdPromptSchema)
      : PENDING_SCHEMA;

  return {
    id: row.id,
    collection_name: row.name || 'Ad library',
    canva_design_id: `client-template:${row.id}`,
    page_index: 0,
    image_url: row.reference_image_url ?? '',
    prompt_schema: schema,
    vertical: DEFAULT_CUSTOM_VERTICAL,
    format: 'feed',
    ad_category: coerceAdCategory(row.ad_category),
    aspect_ratio: row.aspect_ratio ?? '1:1',
    is_favorite: false,
    is_active: true,
    created_at: row.created_at,
    source_brand: row.tags?.includes('ad_library_scrape') ? 'Ad library scrape' : 'Your uploads',
    templateOrigin: 'custom',
  };
}
