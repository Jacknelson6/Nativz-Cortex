import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { BRAND_DNA_AI_TIMEOUT_MS } from './constants';
import type { CrawledPage } from './types';
import type {
  BrandAudienceBenchmarks,
  IdealCustomerProfile,
  ProductItem,
  SimilarBrandReference,
} from '@/lib/knowledge/types';
import type { VerbalIdentityAnalysis } from './analyze-verbal';
import { formatReferenceAdvertisersForPrompt, metaAdLibrarySearchUrl } from './reference-advertisers';

function asStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim());
}

function parseIcp(raw: Record<string, unknown>): IdealCustomerProfile | null {
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  if (!label || !summary) return null;
  return {
    label,
    summary,
    demographics: typeof raw.demographics === 'string' ? raw.demographics.trim() : undefined,
    pain_points: asStrArray(raw.pain_points ?? raw.painPoints),
    goals: asStrArray(raw.goals),
    preferred_channels: asStrArray(raw.preferred_channels ?? raw.preferredChannels),
    buying_signals: asStrArray(raw.buying_signals ?? raw.buyingSignals),
  };
}

/**
 * Generate five ICPs, similar brands for Meta Ad Library study, and logo usage guidance.
 * Uses a curated reference list of advertisers known for strong public image ads (not an official ranking).
 */
export async function extractAudienceBenchmarks(input: {
  clientName: string;
  websiteUrl: string;
  pages: CrawledPage[];
  products: ProductItem[];
  verbalIdentity: VerbalIdentityAnalysis | null;
  logoUrls: string[];
}): Promise<BrandAudienceBenchmarks> {
  const { clientName, websiteUrl, pages, products, verbalIdentity, logoUrls } = input;

  const homepage = pages.find((p) => p.pageType === 'homepage');
  const about = pages.find((p) => p.pageType === 'about');
  const snippets = [homepage, about]
    .filter(Boolean)
    .map((p) => `### ${p!.url}\n${p!.content.slice(0, 2800)}`)
    .join('\n\n---\n\n');

  const productBrief = products
    .slice(0, 24)
    .map(
      (p) =>
        `- ${p.name} [${p.offeringType ?? 'unspecified'}]${p.category ? ` (${p.category})` : ''}: ${p.description.slice(0, 220)}`,
    )
    .join('\n');

  const verbalBrief = verbalIdentity
    ? `Tone: ${verbalIdentity.tonePrimary}\nAudience (draft): ${verbalIdentity.targetAudienceSummary}\nPositioning: ${verbalIdentity.competitivePositioning}`
    : 'No verbal analysis available.';

  const logoBrief =
    logoUrls.length > 0
      ? `Logo asset URLs found on site:\n${logoUrls.slice(0, 8).map((u) => `- ${u}`).join('\n')}`
      : 'No logo URLs extracted.';

  const referenceBlock = formatReferenceAdvertisersForPrompt();

  const systemPrompt = `You are a brand strategist preparing acquisition creative briefs. Return ONLY valid JSON with this exact shape:

{
  "ideal_customer_profiles": [
    {
      "label": "Short memorable ICP title (e.g. 'The time-starved founder')",
      "summary": "2-3 sentences",
      "demographics": "optional string",
      "pain_points": ["3-5 bullets"],
      "goals": ["2-5 bullets"],
      "preferred_channels": ["e.g. Instagram, LinkedIn, podcasts"],
      "buying_signals": ["behaviors that show they're in-market"]
    }
  ],
  "similar_brands_for_ads": [
    {
      "name": "Brand name as searched on Meta",
      "category": "short vertical tag",
      "why_similar": "1-2 sentences: same buyer, price band, or creative pattern — not 'competitor' unless clearly true"
    }
  ],
  "logo_usage_summary": "2-4 sentences: where logos appear on site, which variant for light/dark, clear space, co-branding cautions. If no logos provided, say what to request from the client."
}

Rules:
- Produce **exactly 5** distinct ICPs in ideal_customer_profiles (different jobs-to-be-done or segments).
- Produce **4 to 6** similar_brands_for_ads. At least **3** must be chosen from the REFERENCE_ADVERTISERS list below when any fit the client's vertical; you may add **up to 2** other well-known brands with strong Meta image-ad presences.
- Do NOT output URLs — only brand names for similar_brands_for_ads.
- Affiliate and ambassador programs are not "services" for ICP purposes — focus on buyers of core offers.
- Be specific; avoid generic platitudes.

REFERENCE_ADVERTISERS (pick from when relevant):
${referenceBlock}

Meta Ad Library has no public API for "best advertisers" — these names are starting points for manual library searches by brand name.`;

  const userContent = `Brand: ${clientName}
Website: ${websiteUrl}

## Page excerpts
${snippets || '(no homepage/about text)'}

## Offerings (structured)
${productBrief || '(none)'}

## Verbal identity (draft)
${verbalBrief}

## Logos
${logoBrief}`;

  try {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      maxTokens: 4500,
      feature: 'brand_dna_audience_benchmarks',
      timeoutMs: BRAND_DNA_AI_TIMEOUT_MS,
    });

    const parsed = parseAIResponseJSON<Record<string, unknown>>(result.text);
    const rawIcps = Array.isArray(parsed.ideal_customer_profiles) ? parsed.ideal_customer_profiles : [];
    const idealCustomerProfiles = rawIcps
      .map((x) => parseIcp(x as Record<string, unknown>))
      .filter(Boolean) as IdealCustomerProfile[];

    const rawBrands = Array.isArray(parsed.similar_brands_for_ads) ? parsed.similar_brands_for_ads : [];
    const similarBrandsForAds: SimilarBrandReference[] = rawBrands
      .map((b) => {
        const o = b as Record<string, unknown>;
        const name = typeof o.name === 'string' ? o.name.trim() : '';
        const category = typeof o.category === 'string' ? o.category.trim() : '';
        const why_similar =
          typeof o.why_similar === 'string'
            ? o.why_similar.trim()
            : typeof o.whySimilar === 'string'
              ? o.whySimilar.trim()
              : '';
        if (!name) return null;
        return {
          name,
          category: category || 'General',
          why_similar,
          meta_ad_library_url: metaAdLibrarySearchUrl(name),
        };
      })
      .filter(Boolean) as SimilarBrandReference[];

    const logoUsageSummary =
      typeof parsed.logo_usage_summary === 'string'
        ? parsed.logo_usage_summary.trim()
        : typeof parsed.logoUsageSummary === 'string'
          ? parsed.logoUsageSummary.trim()
          : '';

    return {
      idealCustomerProfiles: idealCustomerProfiles.slice(0, 5),
      similarBrandsForAds: similarBrandsForAds.slice(0, 8),
      logoUsageSummary,
    };
  } catch (err) {
    console.error('[brand-dna] Audience benchmarks extraction failed:', err);
    return {
      idealCustomerProfiles: [],
      similarBrandsForAds: [],
      logoUsageSummary: '',
    };
  }
}
