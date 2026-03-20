import type { ProductItem } from '@/lib/knowledge/types';

const APPENDIX_START = '<!-- cortex-canonical-products -->';
const APPENDIX_END = '<!-- /cortex-canonical-products -->';

export type ProductCatalogMdMode = 'appendix' | 'standalone';

/**
 * Markdown for the canonical product list (source of truth: Brand DNA metadata).
 * - `appendix`: block appended to the main brand guideline (after AI narrative).
 * - `standalone`: content for the `product_catalog` knowledge entry.
 */
export function buildCanonicalProductCatalogMarkdown(
  products: ProductItem[],
  mode: ProductCatalogMdMode = 'appendix',
): string {
  const sections: string[] = [];

  if (mode === 'standalone') {
    sections.push('# Products & Services\n');
  } else {
    sections.push('## Structured product catalog\n');
  }

  if (!products?.length) {
    sections.push('_No products or services in structured Brand DNA yet._');
    return sections.join('\n');
  }

  if (mode === 'appendix') {
    sections.push(
      '_Authoritative list (same structured data as Brand DNA cards). Updated when you edit **Product catalog** in Cortex._\n',
    );
  }

  const byCategory = new Map<string, ProductItem[]>();
  for (const p of products) {
    const cat = p.category?.trim() || 'General';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }

  for (const [category, items] of byCategory) {
    sections.push(mode === 'standalone' ? `## ${category}` : `### ${category}`);
    for (const p of items) {
      const name = p.name?.trim() || 'Unnamed';
      const bits: string[] = [];
      if (p.imageUrl?.trim()) {
        bits.push(`![${name.replace(/]/g, '')}](${p.imageUrl.trim()})`);
      }
      let line = `- **${name}**`;
      if (p.description?.trim()) line += ` — ${p.description.trim()}`;
      if (p.price?.trim()) line += ` _(${p.price.trim()})_`;
      bits.push(line);
      sections.push(bits.join('\n\n'));
    }
    sections.push('');
  }

  return sections.join('\n');
}

/** Remove prior canonical appendix (markers included). */
export function stripProductAppendix(markdown: string): string {
  const re = new RegExp(
    `\\n*${escapeRe(APPENDIX_START)}[\\s\\S]*?${escapeRe(APPENDIX_END)}\\n*$`,
    'm',
  );
  return markdown.replace(re, '').trimEnd();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Append or replace the canonical product block at the end of the guideline markdown. */
export function mergeProductAppendix(markdown: string, products: ProductItem[]): string {
  const body = stripProductAppendix(markdown);
  const appendix = buildCanonicalProductCatalogMarkdown(products ?? []);
  return `${body}\n\n${APPENDIX_START}\n\n${appendix}\n\n${APPENDIX_END}`;
}
