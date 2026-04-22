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
  /**
   * Text from imported files (markdown, notes, etc.) for prompts — not the main guideline body.
   * Populated from `client_knowledge_entries` with source=imported, type=document.
   */
  creativeSupplementBlock: string;
  /**
   * Public URLs of imported brand images (logos, mood boards, packaging) for image-model reference.
   * From source=imported, type=brand_asset.
   */
  creativeReferenceImageUrls: string[];

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
  creativeSupplementBlock: string;
  creativeReferenceImageUrls: string[];
}

type BrandContextData = Omit<BrandContext, 'toPromptBlock' | 'toFullContext'>;

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
export async function getBrandContext(
  clientId: string,
  opts?: { bypassCache?: boolean },
): Promise<BrandContext> {
  // Check cache
  if (!opts?.bypassCache) {
    const cached = cache.get(clientId);
    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }
  }

  const admin = createAdminClient();

  // Fetch client, brand guideline, and imported creative supplements in parallel
  const [clientResult, guidelineResult, importedResult] = await Promise.all([
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
    admin
      .from('client_knowledge_entries')
      .select('type, title, content, metadata, created_at')
      .eq('client_id', clientId)
      .eq('source', 'imported')
      .in('type', ['document', 'brand_asset'])
      .order('created_at', { ascending: false })
      .limit(80),
  ]);

  const client = clientResult.data;
  if (!client) {
    throw new Error(`Client ${clientId} not found`);
  }

  const guideline = guidelineResult.data as KnowledgeEntry | null;
  const rawMeta = guideline?.metadata ?? null;
  const meta = rawMeta
    ? normalizeHubMetadata(rawMeta as unknown as Record<string, unknown>)
    : null;
  const supplemental = buildCreativeSupplementFromImportedRows(importedResult.data ?? []);

  let data: BrandContextData;

  if (guideline && meta) {
    data = buildFromGuidelineData(client, guideline, meta, supplemental);
    data = await mergeBrandDnaSubnodes(admin, clientId, data);
  } else {
    data = buildFromClientFieldsData(client, supplemental);
  }

  const context = attachMethods(data);

  // Cache result
  cache.set(clientId, { data: context, expiry: Date.now() + CACHE_TTL_MS });

  return context;
}

// ---------------------------------------------------------------------------
// Imported files → creative prompts (same pipeline as Brand DNA upload)
// ---------------------------------------------------------------------------

type ImportedKnowledgeRow = {
  type: string;
  title: string | null;
  content: string | null;
  metadata: unknown;
};

const CREATIVE_SUPPLEMENT_TEXT_BUDGET = 14_000;
const CREATIVE_SUPPLEMENT_MAX_PER_DOC = 4_500;
const CREATIVE_SUPPLEMENT_MAX_IMAGES = 14;

function buildCreativeSupplementFromImportedRows(rows: ImportedKnowledgeRow[]): {
  creativeSupplementBlock: string;
  creativeReferenceImageUrls: string[];
} {
  const imageUrls: string[] = [];
  const textParts: string[] = [];
  let budget = CREATIVE_SUPPLEMENT_TEXT_BUDGET;

  for (const row of rows) {
    if (row.type === 'brand_asset') {
      const meta = row.metadata as Record<string, unknown> | null;
      const url = meta?.file_url;
      if (
        typeof url === 'string' &&
        url.startsWith('http') &&
        !imageUrls.includes(url) &&
        imageUrls.length < CREATIVE_SUPPLEMENT_MAX_IMAGES
      ) {
        imageUrls.push(url);
      }
    }

    if (row.type === 'document') {
      const title = (row.title ?? 'Document').trim() || 'Document';
      const content = (row.content ?? '').trim();
      const isPdfPlaceholder =
        /^PDF document uploaded:/i.test(content) ||
        (content.length < 160 && /pending|extraction/i.test(content));

      let body: string;
      if (content.length > 80 && !isPdfPlaceholder) {
        const sliceLen = Math.min(CREATIVE_SUPPLEMENT_MAX_PER_DOC, Math.max(0, budget - title.length - 24));
        body = sliceLen > 0 ? content.slice(0, sliceLen) : '';
      } else {
        body =
          '(Uploaded file on record — follow formal brand guideline conventions: typography, color discipline, and campaign tone implied by the filename and any Brand DNA above.)';
      }

      const chunk = `## ${title}\n${body}`;
      if (body && chunk.length <= budget) {
        textParts.push(chunk);
        budget -= chunk.length + 2;
      } else if (body && budget > 80) {
        const short = `## ${title}\n${body.slice(0, Math.max(0, budget - title.length - 8))}…`;
        textParts.push(short);
        budget = 0;
      }
    }
  }

  return {
    creativeSupplementBlock: textParts.join('\n\n'),
    creativeReferenceImageUrls: imageUrls,
  };
}

// ---------------------------------------------------------------------------
// Hub metadata + sub-node merge (ad generation reads hub; UI can match sub-nodes)
// ---------------------------------------------------------------------------

function pickStr(r: Record<string, unknown>, snake: string, camel: string): string | null {
  const a = r[snake];
  const b = r[camel];
  if (typeof a === 'string' && a.trim()) return a.trim();
  if (typeof b === 'string' && b.trim()) return b.trim();
  return null;
}

function pickStrArr(r: Record<string, unknown>, snake: string, camel: string): string[] {
  const a = r[snake];
  const b = r[camel];
  const raw = Array.isArray(a) && a.length > 0 ? a : Array.isArray(b) ? b : [];
  return (raw as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/**
 * Hub `brand_guideline.metadata` should use snake_case; tolerate camelCase or sparse hubs
 * by filling from alternate keys. Does not replace non-empty snake arrays/strings.
 */
function normalizeHubMetadata(raw: Record<string, unknown>): BrandGuidelineMetadata {
  const base = raw as unknown as BrandGuidelineMetadata;
  const r = raw;

  const colors = base.colors?.length ? base.colors : Array.isArray(r.colors) ? (r.colors as BrandColor[]) : [];
  const fonts = base.fonts?.length ? base.fonts : Array.isArray(r.fonts) ? (r.fonts as BrandFont[]) : [];
  const logos = base.logos?.length ? base.logos : Array.isArray(r.logos) ? (r.logos as BrandLogo[]) : [];
  const screenshots = base.screenshots?.length
    ? base.screenshots
    : Array.isArray(r.screenshots)
      ? (r.screenshots as BrandScreenshot[])
      : [];
  const products = base.products?.length ? base.products : Array.isArray(r.products) ? (r.products as ProductItem[]) : [];

  const designStyle =
    base.design_style ??
    (r.design_style as DesignStyle | null | undefined) ??
    (r.designStyle as DesignStyle | null | undefined) ??
    null;

  return {
    ...base,
    colors,
    fonts,
    logos,
    screenshots,
    products,
    design_style: designStyle,
    tone_primary: base.tone_primary ?? pickStr(r, 'tone_primary', 'tonePrimary'),
    voice_attributes: base.voice_attributes?.length
      ? base.voice_attributes
      : pickStrArr(r, 'voice_attributes', 'voiceAttributes'),
    messaging_pillars: base.messaging_pillars?.length
      ? base.messaging_pillars
      : pickStrArr(r, 'messaging_pillars', 'messagingPillars'),
    vocabulary_patterns: base.vocabulary_patterns?.length
      ? base.vocabulary_patterns
      : pickStrArr(r, 'vocabulary_patterns', 'vocabularyPatterns'),
    avoidance_patterns: base.avoidance_patterns?.length
      ? base.avoidance_patterns
      : pickStrArr(r, 'avoidance_patterns', 'avoidancePatterns'),
    target_audience_summary:
      base.target_audience_summary ??
      pickStr(r, 'target_audience_summary', 'targetAudienceSummary'),
    competitive_positioning:
      base.competitive_positioning ??
      pickStr(r, 'competitive_positioning', 'competitivePositioning'),
  };
}

/**
 * When the hub row is missing fields (partial PATCH, legacy rows, or apply-draft content-only merges),
 * pull structured slices from Brand DNA category nodes so prompts match what the Brand DNA UI shows.
 */
async function mergeBrandDnaSubnodes(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  data: BrandContextData,
): Promise<BrandContextData> {
  const { metadata } = data;
  let { verbalIdentity, visualIdentity, audience, positioning, products } = data;

  const verbalWeak =
    !verbalIdentity.tonePrimary?.trim() &&
    verbalIdentity.voiceAttributes.length === 0 &&
    verbalIdentity.messagingPillars.length === 0 &&
    verbalIdentity.vocabularyPatterns.length === 0;

  if (verbalWeak) {
    const { data: row } = await admin
      .from('client_knowledge_entries')
      .select('metadata')
      .eq('client_id', clientId)
      .eq('type', 'verbal_identity')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const vm = row?.metadata as Record<string, unknown> | undefined;
    if (vm) {
      verbalIdentity = {
        tonePrimary: verbalIdentity.tonePrimary ?? pickStr(vm, 'tone_primary', 'tonePrimary'),
        voiceAttributes: verbalIdentity.voiceAttributes.length
          ? verbalIdentity.voiceAttributes
          : pickStrArr(vm, 'voice_attributes', 'voiceAttributes'),
        messagingPillars: verbalIdentity.messagingPillars.length
          ? verbalIdentity.messagingPillars
          : pickStrArr(vm, 'messaging_pillars', 'messagingPillars'),
        vocabularyPatterns: verbalIdentity.vocabularyPatterns.length
          ? verbalIdentity.vocabularyPatterns
          : pickStrArr(vm, 'vocabulary_patterns', 'vocabularyPatterns'),
        avoidancePatterns: verbalIdentity.avoidancePatterns.length
          ? verbalIdentity.avoidancePatterns
          : pickStrArr(vm, 'avoidance_patterns', 'avoidancePatterns'),
      };
    }
  }

  if (!audience.summary?.trim()) {
    const { data: row } = await admin
      .from('client_knowledge_entries')
      .select('metadata')
      .eq('client_id', clientId)
      .eq('type', 'target_audience')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const tm = row?.metadata as Record<string, unknown> | undefined;
    if (tm && typeof tm.summary === 'string' && tm.summary.trim()) {
      audience = { summary: tm.summary.trim() };
    }
  }

  if (!positioning?.trim()) {
    const { data: row } = await admin
      .from('client_knowledge_entries')
      .select('metadata')
      .eq('client_id', clientId)
      .eq('type', 'competitive_positioning')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const pm = row?.metadata as Record<string, unknown> | undefined;
    const stmt =
      pm && typeof pm.positioning_statement === 'string' ? pm.positioning_statement.trim() : '';
    if (stmt) positioning = stmt;
  }

  if (products.length === 0) {
    const { data: row } = await admin
      .from('client_knowledge_entries')
      .select('metadata')
      .eq('client_id', clientId)
      .eq('type', 'product_catalog')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const pm = row?.metadata as Record<string, unknown> | undefined;
    if (pm && Array.isArray(pm.products) && pm.products.length > 0) {
      products = pm.products as ProductItem[];
    }
  }

  const { data: viRow } = await admin
    .from('client_knowledge_entries')
    .select('metadata')
    .eq('client_id', clientId)
    .eq('type', 'visual_identity')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const vim = viRow?.metadata as Record<string, unknown> | undefined;
  const subColors = Array.isArray(vim?.colors) ? (vim.colors as BrandColor[]) : [];
  const subFonts = Array.isArray(vim?.fonts) ? (vim.fonts as BrandFont[]) : [];
  const subLogos = Array.isArray(vim?.logos) ? (vim.logos as BrandLogo[]) : [];
  const subScreenshots = Array.isArray(vim?.screenshots) ? (vim.screenshots as BrandScreenshot[]) : [];
  const subDesign =
    (vim?.design_style as DesignStyle | null | undefined) ??
    (vim?.designStyle as DesignStyle | null | undefined) ??
    null;

  visualIdentity = {
    colors: visualIdentity.colors.length > 0 ? visualIdentity.colors : subColors,
    fonts: visualIdentity.fonts.length > 0 ? visualIdentity.fonts : subFonts,
    logos: visualIdentity.logos.length > 0 ? visualIdentity.logos : subLogos,
    screenshots: visualIdentity.screenshots.length > 0 ? visualIdentity.screenshots : subScreenshots,
    designStyle: visualIdentity.designStyle ?? subDesign,
  };

  // Hub `brand_guideline.metadata` is authoritative after user edits in Admin.
  if (metadata?.colors?.length) {
    visualIdentity = { ...visualIdentity, colors: metadata.colors };
  }
  if (metadata?.fonts?.length) {
    visualIdentity = { ...visualIdentity, fonts: metadata.fonts };
  }
  if (metadata?.logos?.length) {
    visualIdentity = { ...visualIdentity, logos: metadata.logos };
  }
  if (metadata?.screenshots?.length) {
    visualIdentity = { ...visualIdentity, screenshots: metadata.screenshots };
  }
  if (metadata?.design_style != null) {
    visualIdentity = { ...visualIdentity, designStyle: metadata.design_style };
  }

  let nextMeta = metadata;
  if (metadata) {
    nextMeta = {
      ...metadata,
      tone_primary: verbalIdentity.tonePrimary ?? metadata.tone_primary,
      voice_attributes: verbalIdentity.voiceAttributes.length
        ? verbalIdentity.voiceAttributes
        : metadata.voice_attributes,
      messaging_pillars: verbalIdentity.messagingPillars.length
        ? verbalIdentity.messagingPillars
        : metadata.messaging_pillars,
      vocabulary_patterns: verbalIdentity.vocabularyPatterns.length
        ? verbalIdentity.vocabularyPatterns
        : metadata.vocabulary_patterns,
      avoidance_patterns: verbalIdentity.avoidancePatterns.length
        ? verbalIdentity.avoidancePatterns
        : metadata.avoidance_patterns,
      target_audience_summary: audience.summary ?? metadata.target_audience_summary,
      competitive_positioning: positioning ?? metadata.competitive_positioning,
      colors: metadata.colors?.length ? metadata.colors : visualIdentity.colors,
      fonts: metadata.fonts?.length ? metadata.fonts : visualIdentity.fonts,
      logos: metadata.logos?.length ? metadata.logos : visualIdentity.logos,
      screenshots: metadata.screenshots?.length ? metadata.screenshots : visualIdentity.screenshots,
      products: products.length ? products : metadata.products,
      design_style: visualIdentity.designStyle ?? metadata.design_style,
    };
  }

  return {
    ...data,
    verbalIdentity,
    visualIdentity,
    audience,
    positioning,
    products,
    metadata: nextMeta,
  };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildFromGuidelineData(
  client: Record<string, unknown>,
  guideline: KnowledgeEntry,
  meta: BrandGuidelineMetadata,
  supplemental: { creativeSupplementBlock: string; creativeReferenceImageUrls: string[] },
): BrandContextData {
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

  return {
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
    creativeSupplementBlock: supplemental.creativeSupplementBlock,
    creativeReferenceImageUrls: supplemental.creativeReferenceImageUrls,
  };
}

function buildFromClientFieldsData(
  client: Record<string, unknown>,
  supplemental: { creativeSupplementBlock: string; creativeReferenceImageUrls: string[] },
): BrandContextData {
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

  return {
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
    creativeSupplementBlock: supplemental.creativeSupplementBlock,
    creativeReferenceImageUrls: supplemental.creativeReferenceImageUrls,
  };
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

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
      creativeSupplementBlock: data.creativeSupplementBlock,
      creativeReferenceImageUrls: data.creativeReferenceImageUrls,
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

  const vid = ctx.visualIdentity;
  if (vid.colors.length > 0 || vid.fonts.length > 0 || vid.logos.length > 0) {
    let visBlock = '<visual_identity>';
    if (vid.colors.length > 0) {
      const lines = vid.colors
        .slice(0, 8)
        .map((c) => `${c.role}: ${c.hex}${c.name ? ` (${c.name})` : ''}`);
      visBlock += `\nBrand palette (use on the ad):\n${lines.join('\n')}`;
    }
    if (vid.fonts.length > 0) {
      visBlock += `\nTypography:\n${vid.fonts
        .slice(0, 6)
        .map((f) => `${f.role}: ${f.family}${f.weight ? ` — ${f.weight}` : ''}`)
        .join('\n')}`;
    }
    if (vid.logos.length > 0) {
      visBlock += `\nOfficial logo assets:\n${vid.logos
        .slice(0, 4)
        .map((l) => `- ${l.variant}: ${l.url}`)
        .join('\n')}`;
    }
    visBlock += '\n</visual_identity>';
    sections.push(visBlock);
  }

  // Verbal identity (include pillars/vocab even when tone line is empty — some hubs only store those)
  const vi = ctx.verbalIdentity;
  if (
    vi.tonePrimary ||
    vi.voiceAttributes.length > 0 ||
    vi.messagingPillars.length > 0 ||
    vi.vocabularyPatterns.length > 0
  ) {
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
      .slice(0, 24)
      .map((p) => {
        const type = p.offeringType ? ` [${p.offeringType}]` : '';
        const img = p.imageUrl ? ` | image: ${p.imageUrl}` : '';
        const price = p.price ? ` | ${p.price}` : '';
        return `- ${p.name}${type}${p.description ? `: ${p.description}` : ''}${price}${img}`;
      })
      .join('\n');
    sections.push(`<products>\n${productLines}\n</products>`);
  }

  const meta = ctx.metadata;
  if (meta?.ideal_customer_profiles?.length) {
    let icpBlock = '<ideal_customer_profiles>';
    for (const icp of meta.ideal_customer_profiles.slice(0, 5)) {
      icpBlock += `\n## ${icp.label}\n${icp.summary}`;
      if (icp.pain_points?.length) icpBlock += `\nPain points: ${icp.pain_points.join('; ')}`;
      if (icp.goals?.length) icpBlock += `\nGoals: ${icp.goals.join('; ')}`;
    }
    icpBlock += '\n</ideal_customer_profiles>';
    sections.push(icpBlock);
  }

  if (meta?.similar_brands_for_ads?.length) {
    const peerLines = meta.similar_brands_for_ads
      .map((b) => `- ${b.name} (${b.category}): ${b.why_similar}\n  Meta Ad Library: ${b.meta_ad_library_url}`)
      .join('\n');
    sections.push(`<meta_ad_library_peers>\n${peerLines}\n</meta_ad_library_peers>`);
  }

  if (meta?.logo_usage_summary?.trim()) {
    sections.push(`<logo_usage>\n${meta.logo_usage_summary.trim()}\n</logo_usage>`);
  }

  // Target audience
  if (ctx.audience.summary) {
    sections.push(`<target_audience>\n${ctx.audience.summary}\n</target_audience>`);
  }

  // Competitive positioning
  if (ctx.positioning) {
    sections.push(`<competitive_positioning>\n${ctx.positioning}\n</competitive_positioning>`);
  }

  // Structured framing rules (CTAs, quote bank, claim hygiene, funnel rules) —
  // load-bearing scripting guardrails that sit in metadata, not body text. These
  // must reach every prompt; serialize BEFORE the truncated document body so
  // they survive the token budget even when the body gets clipped.
  if (meta?.content_framing_rules) {
    const r = meta.content_framing_rules;
    const lines: string[] = [];
    if (r.mandatory_rule) lines.push(`Mandatory: ${r.mandatory_rule}`);
    if (r.funnel_hierarchy) {
      const h = r.funnel_hierarchy;
      if (h.top) lines.push(`Funnel top (curiosity): ${h.top}`);
      if (h.middle) lines.push(`Funnel middle (consideration): ${h.middle}`);
      if (h.bottom) lines.push(`Funnel bottom (action): ${h.bottom}`);
    }
    if (r.cta_alignment) lines.push(`CTA alignment: ${r.cta_alignment}`);
    if (r.show_dont_imply) lines.push(`Show-don't-imply: ${r.show_dont_imply}`);
    if (r.free_offer_framing) lines.push(`Offer framing: ${r.free_offer_framing}`);
    if (lines.length > 0) {
      sections.push(`<content_framing_rules>\n${lines.join('\n')}\n</content_framing_rules>`);
    }
  }

  if (meta?.approved_ctas?.length) {
    sections.push(`<approved_ctas>\n${meta.approved_ctas.map((c) => `- ${c}`).join('\n')}\n</approved_ctas>`);
  }

  if (meta?.banned_ctas?.length) {
    sections.push(`<banned_ctas>\nNever use these CTA phrasings:\n${meta.banned_ctas.map((c) => `- ${c}`).join('\n')}\n</banned_ctas>`);
  }

  if (meta?.approved_quote_bank?.length) {
    sections.push(
      `<approved_quote_bank>\nUse these verbatim or as style models when they fit:\n${meta.approved_quote_bank.map((q) => `- ${q}`).join('\n')}\n</approved_quote_bank>`,
    );
  }

  if (meta?.claim_hygiene_rules && Object.keys(meta.claim_hygiene_rules).length > 0) {
    const lines = Object.entries(meta.claim_hygiene_rules).map(([k, v]) => `- ${k}: ${v}`);
    sections.push(`<claim_hygiene_rules>\n${lines.join('\n')}\n</claim_hygiene_rules>`);
  }

  if (meta?.short_form_video_rules && Object.keys(meta.short_form_video_rules).length > 0) {
    const lines = Object.entries(meta.short_form_video_rules).map(([k, v]) => `- ${k}: ${v}`);
    sections.push(`<short_form_video_rules>\n${lines.join('\n')}\n</short_form_video_rules>`);
  }

  if (meta?.casting_and_tone && Object.keys(meta.casting_and_tone).length > 0) {
    const lines = Object.entries(meta.casting_and_tone).map(([k, v]) => `- ${k}: ${v}`);
    sections.push(`<casting_and_tone>\n${lines.join('\n')}\n</casting_and_tone>`);
  }

  // If from guideline, include the document body too. Bumped cap from 4k → 16k
  // so narrative sections like "Content framing rules" at the tail of a long
  // Brand DNA doc don't get chopped off. Total brand_dna block still bounded:
  // structured sections (visuals / tone / products / ICPs / framing / CTAs /
  // quotes / claim hygiene) add maybe 4-6k on a well-populated brand, leaving
  // the model plenty of budget for messages + research blocks.
  if (ctx.guidelineContent) {
    const MAX_GUIDELINE_CHARS = 16_000;
    const truncated = ctx.guidelineContent.length > MAX_GUIDELINE_CHARS
      ? ctx.guidelineContent.substring(0, MAX_GUIDELINE_CHARS) + '\n...(truncated)'
      : ctx.guidelineContent;
    sections.push(`<brand_guideline_document>\n${truncated}\n</brand_guideline_document>`);
  }

  if (ctx.creativeSupplementBlock.trim()) {
    const raw = ctx.creativeSupplementBlock;
    const truncated = raw.length > 6000 ? `${raw.slice(0, 6000)}\n...(truncated)` : raw;
    sections.push(`<uploaded_brand_materials>\n${truncated}\n</uploaded_brand_materials>`);
  }

  sections.push('</brand_dna>');
  return sections.join('\n\n');
}
