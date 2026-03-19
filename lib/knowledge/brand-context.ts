import { createAdminClient } from '@/lib/supabase/admin';
import type {
  KnowledgeEntry,
  BrandGuidelineMetadata,
  BrandColor,
  BrandFont,
  BrandLogo,
  BrandScreenshot,
  ProductItem,
  DesignStyle,
} from './types';

// ---------------------------------------------------------------------------
// Brand context types
// ---------------------------------------------------------------------------

export interface VisualIdentity {
  colors: BrandColor[];
  fonts: BrandFont[];
  logos: BrandLogo[];
  screenshots: BrandScreenshot[];
  designStyle: DesignStyle | null;
}

export interface VerbalIdentity {
  tonePrimary: string | null;
  voiceAttributes: string[];
  messagingPillars: string[];
  vocabularyPatterns: string[];
  avoidancePatterns: string[];
}

export interface AudienceProfile {
  summary: string | null;
}

export interface BrandContext {
  /** Whether this context comes from a brand_guideline entry (true) or raw client fields (false) */
  fromGuideline: boolean;
  /** Brand guideline knowledge entry ID, if sourced from guideline */
  guidelineId: string | null;
  /** Full markdown content of the guideline */
  guidelineContent: string | null;
  /** Client record fields (always populated) */
  clientName: string;
  clientIndustry: string;
  clientWebsiteUrl: string | null;
  /** Structured visual identity */
  visualIdentity: VisualIdentity;
  /** Structured verbal identity */
  verbalIdentity: VerbalIdentity;
  /** Product catalog */
  products: ProductItem[];
  /** Target audience */
  audience: AudienceProfile;
  /** Competitive positioning summary */
  positioning: string | null;
  /** Full guideline metadata (if from guideline) */
  metadata: BrandGuidelineMetadata | null;

  /** Serialize for AI prompt injection (text only, no images) */
  toPromptBlock: () => string;
  /** Return full context including image URLs for UI rendering */
  toFullContext: () => BrandContextFull;
}

export interface BrandContextFull {
  clientName: string;
  clientIndustry: string;
  clientWebsiteUrl: string | null;
  visualIdentity: VisualIdentity;
  verbalIdentity: VerbalIdentity;
  products: ProductItem[];
  audience: AudienceProfile;
  positioning: string | null;
  guidelineContent: string | null;
  metadata: BrandGuidelineMetadata | null;
}

// ---------------------------------------------------------------------------
// In-memory cache (5-minute TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: BrandContext; expiry: number }>();

/** Clear cached brand context for a client (call after guideline updates) */
export function invalidateBrandContext(clientId: string): void {
  cache.delete(clientId);
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Get the unified brand context for a client.
 * Reads from brand_guideline knowledge entry first, falls back to raw client fields.
 * Results are cached for 5 minutes per client.
 */
export async function getBrandContext(clientId: string): Promise<BrandContext> {
  // Check cache
  const cached = cache.get(clientId);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  const admin = createAdminClient();

  // Fetch client record + brand guideline in parallel
  const [clientResult, guidelineResult] = await Promise.all([
    admin
      .from('clients')
      .select('name, industry, target_audience, brand_voice, topic_keywords, website_url, preferences, description')
      .eq('id', clientId)
      .maybeSingle(),
    admin
      .from('client_knowledge_entries')
      .select('*')
      .eq('client_id', clientId)
      .eq('type', 'brand_guideline')
      .is('metadata->superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const client = clientResult.data;
  if (!client) {
    throw new Error(`Client ${clientId} not found`);
  }

  const guideline = guidelineResult.data as KnowledgeEntry | null;
  const meta = (guideline?.metadata ?? null) as BrandGuidelineMetadata | null;
  const prefs = client.preferences as Record<string, unknown> | null;

  let context: BrandContext;

  if (guideline && meta) {
    // Build from brand guideline
    context = buildFromGuideline(client, guideline, meta);
  } else {
    // Fallback: build from raw client fields
    context = buildFromClientFields(client);
  }

  // Cache result
  cache.set(clientId, { data: context, expiry: Date.now() + CACHE_TTL_MS });

  return context;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildFromGuideline(
  client: Record<string, unknown>,
  guideline: KnowledgeEntry,
  meta: BrandGuidelineMetadata,
): BrandContext {
  const visualIdentity: VisualIdentity = {
    colors: meta.colors ?? [],
    fonts: meta.fonts ?? [],
    logos: meta.logos ?? [],
    screenshots: meta.screenshots ?? [],
    designStyle: meta.design_style ?? null,
  };

  const verbalIdentity: VerbalIdentity = {
    tonePrimary: meta.tone_primary ?? null,
    voiceAttributes: meta.voice_attributes ?? [],
    messagingPillars: meta.messaging_pillars ?? [],
    vocabularyPatterns: meta.vocabulary_patterns ?? [],
    avoidancePatterns: meta.avoidance_patterns ?? [],
  };

  const prefs = client.preferences as Record<string, unknown> | null;

  // Merge preferences from client record if guideline doesn't have them
  if (verbalIdentity.avoidancePatterns.length === 0 && prefs) {
    const topicsAvoid = (prefs.topics_avoid as string[]) ?? [];
    if (topicsAvoid.length > 0) verbalIdentity.avoidancePatterns = topicsAvoid;
  }

  return attachMethods({
    fromGuideline: true,
    guidelineId: guideline.id,
    guidelineContent: guideline.content,
    clientName: (client.name as string) ?? '',
    clientIndustry: (client.industry as string) ?? '',
    clientWebsiteUrl: (client.website_url as string) ?? null,
    visualIdentity,
    verbalIdentity,
    products: meta.products ?? [],
    audience: { summary: meta.target_audience_summary ?? (client.target_audience as string) ?? null },
    positioning: meta.competitive_positioning ?? null,
    metadata: meta,
  });
}

function buildFromClientFields(client: Record<string, unknown>): BrandContext {
  const prefs = client.preferences as Record<string, unknown> | null;

  const verbalIdentity: VerbalIdentity = {
    tonePrimary: (client.brand_voice as string) ?? null,
    voiceAttributes: [],
    messagingPillars: [],
    vocabularyPatterns: [],
    avoidancePatterns: (prefs?.topics_avoid as string[]) ?? [],
  };

  // Pull tone keywords into voice attributes
  const toneKeywords = (prefs?.tone_keywords as string[]) ?? [];
  if (toneKeywords.length > 0) {
    verbalIdentity.voiceAttributes = toneKeywords;
  }

  // Pull topics_lean_into into messaging pillars
  const topicsLeanInto = (prefs?.topics_lean_into as string[]) ?? [];
  if (topicsLeanInto.length > 0) {
    verbalIdentity.messagingPillars = topicsLeanInto;
  }

  return attachMethods({
    fromGuideline: false,
    guidelineId: null,
    guidelineContent: null,
    clientName: (client.name as string) ?? '',
    clientIndustry: (client.industry as string) ?? '',
    clientWebsiteUrl: (client.website_url as string) ?? null,
    visualIdentity: { colors: [], fonts: [], logos: [], screenshots: [], designStyle: null },
    verbalIdentity,
    products: [],
    audience: { summary: (client.target_audience as string) ?? null },
    positioning: null,
    metadata: null,
  });
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

type BrandContextData = Omit<BrandContext, 'toPromptBlock' | 'toFullContext'>;

function attachMethods(data: BrandContextData): BrandContext {
  return {
    ...data,
    toPromptBlock: () => formatPromptBlock(data),
    toFullContext: () => ({
      clientName: data.clientName,
      clientIndustry: data.clientIndustry,
      clientWebsiteUrl: data.clientWebsiteUrl,
      visualIdentity: data.visualIdentity,
      verbalIdentity: data.verbalIdentity,
      products: data.products,
      audience: data.audience,
      positioning: data.positioning,
      guidelineContent: data.guidelineContent,
      metadata: data.metadata,
    }),
  };
}

function formatPromptBlock(ctx: BrandContextData): string {
  const sections: string[] = [];

  sections.push(`<brand_dna>`);
  sections.push(`<brand_overview>
Name: ${ctx.clientName}
Industry: ${ctx.clientIndustry}${ctx.clientWebsiteUrl ? `\nWebsite: ${ctx.clientWebsiteUrl}` : ''}
</brand_overview>`);

  // Verbal identity
  const vi = ctx.verbalIdentity;
  if (vi.tonePrimary || vi.voiceAttributes.length > 0) {
    let toneBlock = '<tone_and_voice>';
    if (vi.tonePrimary) toneBlock += `\nPrimary tone: ${vi.tonePrimary}`;
    if (vi.voiceAttributes.length > 0) toneBlock += `\nVoice attributes: ${vi.voiceAttributes.join(', ')}`;
    if (vi.messagingPillars.length > 0) toneBlock += `\nMessaging pillars: ${vi.messagingPillars.join(', ')}`;
    if (vi.vocabularyPatterns.length > 0) toneBlock += `\nVocabulary patterns: ${vi.vocabularyPatterns.join(', ')}`;
    toneBlock += '\n</tone_and_voice>';
    sections.push(toneBlock);
  }

  // Content priorities (avoidance)
  if (vi.avoidancePatterns.length > 0 || vi.messagingPillars.length > 0) {
    let prioBlock = '<content_priorities>';
    if (vi.messagingPillars.length > 0) {
      prioBlock += `\nTopics to lean into: ${vi.messagingPillars.join(', ')}`;
    }
    if (vi.avoidancePatterns.length > 0) {
      prioBlock += `\nTopics to EXPLICITLY AVOID: ${vi.avoidancePatterns.join(', ')}`;
    }
    prioBlock += '\n</content_priorities>';
    sections.push(prioBlock);
  }

  // Products
  if (ctx.products.length > 0) {
    const productLines = ctx.products
      .slice(0, 20)
      .map((p) => `- ${p.name}${p.description ? `: ${p.description}` : ''}${p.price ? ` ($${p.price})` : ''}`)
      .join('\n');
    sections.push(`<products>\n${productLines}\n</products>`);
  }

  // Target audience
  if (ctx.audience.summary) {
    sections.push(`<target_audience>\n${ctx.audience.summary}\n</target_audience>`);
  }

  // Competitive positioning
  if (ctx.positioning) {
    sections.push(`<competitive_positioning>\n${ctx.positioning}\n</competitive_positioning>`);
  }

  // If from guideline, include the full content as well (truncated to prevent token explosion)
  if (ctx.guidelineContent) {
    const truncated = ctx.guidelineContent.length > 4000
      ? ctx.guidelineContent.substring(0, 4000) + '\n...(truncated)'
      : ctx.guidelineContent;
    sections.push(`<brand_guideline_document>\n${truncated}\n</brand_guideline_document>`);
  }

  sections.push('</brand_dna>');
  return sections.join('\n\n');
}
