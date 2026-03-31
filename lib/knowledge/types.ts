/** All allowed `client_knowledge_entries.type` values (ontology + legacy). Keep in sync with migration 077. */
export const KNOWLEDGE_ENTRY_TYPES = [
  // Ontology (PRD)
  'document',
  'meeting',
  'decision',
  'action_item',
  'guideline',
  'person',
  'competitor',
  'claim',
  'campaign',
  'product',
  'insight',
  // Legacy
  'brand_asset',
  'brand_profile',
  'brand_guideline',
  'web_page',
  'note',
  'idea',
  'meeting_note',
  'visual_identity',
  'verbal_identity',
  'target_audience',
  'competitive_positioning',
  'product_catalog',
  'brand_logo',
  'brand_screenshot',
] as const;

export type KnowledgeEntryType = (typeof KNOWLEDGE_ENTRY_TYPES)[number];
export type KnowledgeSource = 'manual' | 'scraped' | 'generated' | 'imported';
export type KnowledgeNodeType = 'entry' | 'contact' | 'search' | 'strategy' | 'idea_submission';

export interface KnowledgeEntry {
  id: string;
  client_id: string;
  type: KnowledgeEntryType;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  source: KnowledgeSource;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  client_visible?: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  superseded_by?: string | null;
  confidence?: number;
  temporal_markers?: TemporalMarker[] | null;
}

export interface TemporalMarker {
  type: 'valid_from' | 'valid_until' | 'supersedes' | 'contradicts' | 'as_of';
  value: string;
  source_text: string;
  confidence: number;
}

export type KnowledgeLinkLabel =
  | 'related_to'
  | 'wikilink'
  | 'references'
  | 'supersedes'
  | 'contradicts'
  | 'produced'
  | 'produced_in'
  | 'assigned_to'
  | 'belongs_to'
  | 'mentioned_in'
  | 'about'
  | 'valid_during'
  | 'replaced_by';

export interface KnowledgeLink {
  id: string;
  client_id: string;
  source_id: string;
  source_type: KnowledgeNodeType;
  target_id: string;
  target_type: KnowledgeNodeType;
  label: string;
  created_at: string;
}

export interface KnowledgeGraphData {
  entries: KnowledgeEntry[];
  links: KnowledgeLink[];
  externalNodes: ExternalNode[];
}

export interface ExternalNode {
  id: string;
  type: KnowledgeNodeType;
  title: string;
  subtitle: string;
  created_at: string;
}

// Metadata shapes per entry type
export interface BrandAssetMetadata {
  colors?: string[];
  fonts?: string[];
  file_url?: string;
  asset_type?: 'logo' | 'color_palette' | 'font' | 'style_guide' | 'other';
}

export interface WebPageMetadata {
  source_url: string;
  scraped_at: string;
  depth: number;
  word_count: number;
  status?: 'processing' | 'completed' | 'failed';
}

export interface BrandProfileMetadata {
  generated_from: string[];
  superseded_by?: string;
  colors?: string[];
  fonts?: string[];
}

export interface IdeaMetadata {
  format?: 'short_form' | 'long_form' | 'reel' | 'story';
  content_pillar?: string;
  concept_input?: string;
}

export interface MeetingNoteMetadata {
  meeting_date?: string;
  attendees?: string[];
  action_items?: string[];
  source?: 'fyxer' | 'manual' | 'other';
  /** Set on Fyxer import / manual flows that classify cadence */
  meeting_series?: 'recurring' | 'adhoc';
  /** Client record vs prospect bucket (see slug `fyxer-prospects`) */
  association?: 'client' | 'prospect';
  /** Display / filter label for prospects or extra company context */
  company_label?: string;
}

// ---------------------------------------------------------------------------
// Brand DNA types
// ---------------------------------------------------------------------------

export interface BrandColor {
  hex: string;
  name: string;
  role: 'primary' | 'secondary' | 'accent' | 'tertiary' | 'neutral';
}

export interface BrandFont {
  family: string;
  role: 'display' | 'body' | 'mono';
  weight?: string;
}

export interface BrandLogo {
  url: string;
  variant: 'primary' | 'dark' | 'light' | 'icon';
}

export interface BrandScreenshot {
  url: string;
  page: string;
  description: string;
}

/**
 * What the offering is in the catalog UI (product / service / other).
 * Legacy stored values may still include affiliate_program | ambassador_program | partnership — treat as other when editing.
 */
export type ProductOfferingType =
  | 'product'
  | 'service'
  | 'affiliate_program'
  | 'ambassador_program'
  | 'partnership'
  | 'other';

export interface ProductItem {
  name: string;
  description: string;
  price?: string;
  imageUrl?: string;
  category?: string;
  offeringType?: ProductOfferingType;
  /** Preferred on-ad CTA label for this SKU (wizard + generation). */
  cta?: string;
  /** Promo / urgency line for this SKU (shown in wizard; fed into image prompt offer context). */
  offer?: string;
}

/** One of five ICPs generated during Brand DNA. */
export interface IdealCustomerProfile {
  label: string;
  summary: string;
  demographics?: string;
  pain_points: string[];
  goals: string[];
  preferred_channels: string[];
  buying_signals: string[];
}

/** Peer brand for Meta Ad Library creative research (URL is deterministic search, not a Page ID). */
export interface SimilarBrandReference {
  name: string;
  category: string;
  why_similar: string;
  /** Meta Ad Library search URL for this brand name */
  meta_ad_library_url: string;
}

/** Output of Brand DNA audience / benchmark extraction (ICPs + ad-library peers). */
export interface BrandAudienceBenchmarks {
  idealCustomerProfiles: IdealCustomerProfile[];
  similarBrandsForAds: SimilarBrandReference[];
  logoUsageSummary: string;
}

export interface DesignStyle {
  theme: 'light' | 'dark' | 'mixed';
  corners: 'rounded' | 'sharp' | 'mixed';
  density: 'minimal' | 'moderate' | 'rich';
  imagery: 'photo' | 'illustration' | 'mixed';
}

export interface BrandGuidelineMetadata {
  colors: BrandColor[];
  fonts: BrandFont[];
  logos: BrandLogo[];
  screenshots: BrandScreenshot[];
  products: ProductItem[];
  design_style: DesignStyle | null;
  messaging_pillars: string[];
  tone_primary: string | null;
  voice_attributes: string[];
  vocabulary_patterns: string[];
  avoidance_patterns: string[];
  target_audience_summary: string | null;
  competitive_positioning: string | null;
  /** Five distinct ideal customer profiles */
  ideal_customer_profiles?: IdealCustomerProfile[];
  /** Brands with strong public ad libraries to study for static creative patterns */
  similar_brands_for_ads?: SimilarBrandReference[];
  /** How/when to use extracted logo assets */
  logo_usage_summary?: string | null;
  generated_from: string[];
  version: number;
  superseded_by?: string;
  verified_sections?: Record<string, { verified_at: string; verified_by: string }>;
}

// ---------------------------------------------------------------------------
// Brand DNA sub-node metadata types
// ---------------------------------------------------------------------------

export interface VisualIdentityMetadata {
  colors: BrandColor[];
  fonts: BrandFont[];
  design_style: DesignStyle | null;
}

export interface VerbalIdentityMetadata {
  tone_primary: string | null;
  voice_attributes: string[];
  messaging_pillars: string[];
  vocabulary_patterns: string[];
  avoidance_patterns: string[];
}

export interface TargetAudienceMetadata {
  summary: string;
}

export interface CompetitivePositioningMetadata {
  positioning_statement: string;
}

export interface ProductCatalogMetadata {
  products: ProductItem[];
}

export interface BrandLogoMetadata {
  url: string;
  variant: 'primary' | 'dark' | 'light' | 'icon';
  format?: string;
}

export interface BrandScreenshotMetadata {
  url: string;
  page: string;
  source_url: string;
}

/** All Brand DNA entry types — used for hard-delete on regeneration */
export const BRAND_DNA_TYPES: KnowledgeEntryType[] = [
  'brand_guideline', 'visual_identity', 'verbal_identity',
  'target_audience', 'competitive_positioning', 'product_catalog',
  'brand_logo', 'brand_screenshot',
];
