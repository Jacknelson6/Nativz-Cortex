import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { CrawledPage } from './types';
import type { ProductItem } from '@/lib/knowledge/types';

/**
 * Extract product/service catalog from crawled pages using AI.
 * Handles both e-commerce sites (many products) and service businesses (few offerings).
 */
export async function extractProductCatalog(pages: CrawledPage[]): Promise<ProductItem[]> {
  // Select product-related pages + homepage (which often features top products)
  const productPages = pages.filter((p) => p.pageType === 'product');
  const homepage = pages.find((p) => p.pageType === 'homepage');
  const selectedPages = [...productPages.slice(0, 8), homepage].filter(Boolean) as CrawledPage[];

  if (selectedPages.length === 0) return [];

  const contentBlock = selectedPages
    .map((p) => `### ${p.url}\n${p.content.slice(0, 4000)}`)
    .join('\n\n---\n\n');

  const systemPrompt = `You are a product analyst examining a company's website. Extract ALL products or services mentioned in the content below. Return a JSON array where each item has:

{
  "name": "Product or service name",
  "description": "2-3 sentence description of what it is",
  "price": "price if visible (e.g., '$39/mo', '$299', 'Free'), or null",
  "category": "product category if discernible (e.g., 'Software', 'Containers', 'Consulting')"
}

Rules:
- For e-commerce: extract individual products (cap at 30 most prominent)
- For service businesses: extract each service offering
- Include pricing only if explicitly stated on the page
- If no products or services are found, return an empty array []
- Output ONLY the JSON array. No other text.`;

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
    }));
  } catch (err) {
    console.error('[brand-dna] Product extraction failed:', err);
    return [];
  }
}
