import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { CrawledPage } from './types';
import type { ProductItem } from '@/lib/knowledge/types';
import { collectImageUrlsFromHtml } from './scrape-product-images';

function pickAllowedImageUrl(raw: unknown, allowList: string[]): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  return allowList.includes(t) ? t : undefined;
}

/**
 * Extract product/service catalog from crawled pages using AI.
 * Handles both e-commerce sites (many products) and service businesses (few offerings).
 * Image URLs must come from HTML img tags (allowlist) so we do not invent assets.
 */
export async function extractProductCatalog(pages: CrawledPage[]): Promise<ProductItem[]> {
  const productPages = pages.filter((p) => p.pageType === 'product');
  const homepage = pages.find((p) => p.pageType === 'homepage');
  const selectedPages = [...productPages.slice(0, 8), homepage].filter(Boolean) as CrawledPage[];

  if (selectedPages.length === 0) return [];

  const allowList: string[] = [];
  for (const p of selectedPages) {
    for (const u of collectImageUrlsFromHtml(p.html, p.url, 20)) {
      if (!allowList.includes(u)) allowList.push(u);
      if (allowList.length >= 50) break;
    }
    if (allowList.length >= 50) break;
  }

  const contentBlock = selectedPages
    .map((p) => `### ${p.url}\n${p.content.slice(0, 4000)}`)
    .join('\n\n---\n\n');

  const imageBlock =
    allowList.length > 0
      ? `\n\nAllowed imageUrl values (copy exactly, or use null):\n${allowList.map((u) => `- ${u}`).join('\n')}`
      : '\n\nNo product images were found in page HTML; use null for imageUrl on every item.';

  const systemPrompt = `You are a product analyst examining a company's website. Extract ALL products or services mentioned in the content below. Return a JSON array where each item has:

{
  "name": "Product or service name",
  "description": "2-3 sentence description of what it is",
  "price": "price if visible (e.g., '$39/mo', '$299', 'Free'), or null",
  "category": "product category if discernible (e.g., 'Software', 'Containers', 'Consulting')",
  "imageUrl": null or a string copied EXACTLY from the allowed list below (same characters)
}

Rules:
- For e-commerce: extract individual products (cap at 30 most prominent)
- For service businesses: extract each service offering
- Include pricing only if explicitly stated on the page
- imageUrl MUST be null or one of the allowed URLs verbatim — never invent URLs
- If no products or services are found, return an empty array []
- Output ONLY the JSON array. No other text.${imageBlock}`;

  try {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentBlock },
      ],
      maxTokens: 4000,
      feature: 'brand_dna_products',
    });

    const parsed = parseAIResponseJSON<Record<string, unknown>[]>(result.text);
    return parsed.slice(0, 50).map((p) => ({
      name: (p.name as string) ?? '',
      description: (p.description as string) ?? '',
      price: (p.price as string) ?? undefined,
      category: (p.category as string) ?? undefined,
      imageUrl: pickAllowedImageUrl(p.imageUrl, allowList),
    }));
  } catch (err) {
    console.error('[brand-dna] Product extraction failed:', err);
    return [];
  }
}
