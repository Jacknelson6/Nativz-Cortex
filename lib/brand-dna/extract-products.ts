import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { CrawledPage } from './types';
import type { ProductItem, ProductOfferingType } from '@/lib/knowledge/types';
import { buildProductImageAllowlist } from './scrape-product-images';

function pickAllowedImageUrl(raw: unknown, allowList: string[]): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  return allowList.includes(t) ? t : undefined;
}

const OFFERING_TYPES: ProductOfferingType[] = [
  'product',
  'service',
  'affiliate_program',
  'ambassador_program',
  'partnership',
  'other',
];

function normalizeOfferingType(raw: unknown): ProductOfferingType | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.toLowerCase().trim().replace(/\s+/g, '_');
  if (OFFERING_TYPES.includes(s as ProductOfferingType)) return s as ProductOfferingType;
  if (s.includes('affiliate') || s.includes('referral_partner') || s.includes('partner_program')) {
    return 'affiliate_program';
  }
  if (s.includes('ambassador') || s.includes('creator_program') || s.includes('street_team')) {
    return 'ambassador_program';
  }
  if (s.includes('service') && !s.includes('product')) return 'service';
  if (s.includes('product')) return 'product';
  if (s.includes('partnership')) return 'partnership';
  return undefined;
}

/**
 * Extract product/service catalog from crawled pages using AI.
 * Image URLs must come from HTML (allowlist). Classifies offerings vs affiliate/ambassador programs.
 */
export async function extractProductCatalog(pages: CrawledPage[]): Promise<ProductItem[]> {
  const productPages = pages.filter((p) => p.pageType === 'product');
  const homepage = pages.find((p) => p.pageType === 'homepage');
  const aboutPage = pages.find((p) => p.pageType === 'about');
  const selectedPages = [...productPages.slice(0, 12), homepage, aboutPage].filter(Boolean) as CrawledPage[];

  if (selectedPages.length === 0) return [];

  const allowList = buildProductImageAllowlist(selectedPages, 120);

  const contentBlock = selectedPages
    .map((p) => `### ${p.url} (${p.pageType})\n${p.content.slice(0, 4500)}`)
    .join('\n\n---\n\n');

  const imageBlock =
    allowList.length > 0
      ? `\n\nAllowed imageUrl values (copy exactly, or use null):\n${allowList.map((u) => `- ${u}`).join('\n')}`
      : '\n\nNo product images were found in page HTML; use null for imageUrl on every item.';

  const systemPrompt = `You are a product analyst examining a company's website. Extract DISTINCT products, services, and partner programs mentioned in the content. Return a JSON array where each item has:

{
  "name": "Short name",
  "description": "2-4 sentences: what it is, who it's for, key benefit or proof points if visible on the page",
  "price": "price if visible (e.g. '$39/mo', '$299', 'Free'), or null",
  "category": "e.g. 'Software', 'Skincare', 'Consulting', 'Partner program'",
  "offering_type": "one of: product | service | affiliate_program | ambassador_program | partnership | other",
  "imageUrl": null or a string copied EXACTLY from the allowed list below
}

Classification rules for offering_type (critical):
- **product**: physical or digital goods sold to customers (SKUs, plans as a productized SKU).
- **service**: custom work, agency retainers, professional services, done-for-you offerings.
- **affiliate_program**: earn commission, referral partners, "affiliates", revenue share for promoters — NOT the core paid service.
- **ambassador_program**: brand ambassadors, creator programs, street teams, campus reps — community promotion, not the main consulting/service line.
- **partnership**: B2B partnerships, integrations, reseller agreements (when not clearly affiliate).
- **other**: if unclear.

Rules:
- Prefer items with clear names on the page. Cap at 32 items; prioritize homepage + product pages.
- Write rich descriptions from on-page copy — do not invent features not hinted in the text.
- imageUrl MUST be null or one of the allowed URLs verbatim — never invent URLs.
- Match each item to the best product image from the allowlist when one clearly belongs to that item (same section, alt text, or JSON-LD association).
- If no products or services are found, return []
- Output ONLY the JSON array.${imageBlock}`;

  try {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentBlock },
      ],
      maxTokens: 6000,
      feature: 'brand_dna_products',
    });

    const parsed = parseAIResponseJSON<Record<string, unknown>[]>(result.text);
    return parsed.slice(0, 40).map((p) => {
      const offeringType = normalizeOfferingType(p.offering_type ?? p.offeringType);
      return {
        name: (p.name as string) ?? '',
        description: (p.description as string) ?? '',
        price: (p.price as string) ?? undefined,
        category: (p.category as string) ?? undefined,
        offeringType,
        imageUrl: pickAllowedImageUrl(p.imageUrl, allowList),
      };
    });
  } catch (err) {
    console.error('[brand-dna] Product extraction failed:', err);
    return [];
  }
}
