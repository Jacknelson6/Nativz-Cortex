import { createCompletion } from '@/lib/ai/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StructuredPage {
  pageType:
    | 'about'
    | 'services'
    | 'team'
    | 'faq'
    | 'testimonials'
    | 'contact'
    | 'blog'
    | 'product'
    | 'pricing'
    | 'legal'
    | 'other';
  entities: {
    people: { name: string; role?: string }[];
    products: { name: string; description?: string; price?: string }[];
    locations: { address: string; label?: string }[];
    faqs: { question: string; answer: string }[];
    testimonials: { quote: string; author?: string }[];
  };
  structuredContent: string;
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function makeFallback(rawContent: string): StructuredPage {
  return {
    pageType: 'other',
    entities: {
      people: [],
      products: [],
      locations: [],
      faqs: [],
      testimonials: [],
    },
    structuredContent: rawContent,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function structurePageContent(
  rawContent: string,
  pageUrl: string,
  existingTitles: string[]
): Promise<StructuredPage> {
  const titlesSnippet =
    existingTitles.length > 0
      ? `\nExisting knowledge-base titles (use [[Title]] wikilinks where relevant):\n${existingTitles.map((t) => `- ${t}`).join('\n')}`
      : '';

  const prompt = `You are analyzing a scraped web page. Return a JSON object (no markdown fences) with these fields:

1. "pageType": one of "about", "services", "team", "faq", "testimonials", "contact", "blog", "product", "pricing", "legal", "other"
2. "entities": an object with arrays:
   - "people": [{ "name": string, "role"?: string }]
   - "products": [{ "name": string, "description"?: string, "price"?: string }]
   - "locations": [{ "address": string, "label"?: string }]
   - "faqs": [{ "question": string, "answer": string }]
   - "testimonials": [{ "quote": string, "author"?: string }]
3. "structuredContent": the page content rewritten as clean, well-structured markdown. Use [[wikilinks]] to reference any of the existing titles listed below when they are mentioned or relevant. Remove boilerplate navigation/footer text.

Page URL: ${pageUrl}
${titlesSnippet}

Page content:
${rawContent.slice(0, 12_000)}`;

  try {
    const response = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
    });

    const text = response.text.trim();

    // Strip markdown code fences if present
    const cleaned = text
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned) as StructuredPage;

    // Validate required shape
    if (!parsed.pageType || !parsed.entities || !parsed.structuredContent) {
      return makeFallback(rawContent);
    }

    // Ensure entity arrays exist
    parsed.entities = {
      people: parsed.entities.people ?? [],
      products: parsed.entities.products ?? [],
      locations: parsed.entities.locations ?? [],
      faqs: parsed.entities.faqs ?? [],
      testimonials: parsed.entities.testimonials ?? [],
    };

    return parsed;
  } catch (error) {
    console.error('Failed to structure page content:', error);
    return makeFallback(rawContent);
  }
}
