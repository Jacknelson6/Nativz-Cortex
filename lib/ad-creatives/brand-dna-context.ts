import type { BrandGuidelineMetadata } from '@/lib/knowledge/types';
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';

function absUrl(u: string | null | undefined, base: string): string | null {
  if (!u?.trim()) return null;
  try {
    const out = new URL(u.trim(), base || undefined).href;
    return out.replace(/^http:\/\//i, 'https://');
  } catch {
    return null;
  }
}

/**
 * Build ad-wizard brand + products from active Brand DNA guideline metadata.
 */
export function buildAdWizardContextFromBrandDNA(
  clientName: string,
  websiteUrl: string | null | undefined,
  meta: BrandGuidelineMetadata,
): { brand: ScrapedBrand; products: ScrapedProduct[]; mediaUrls: string[] } {
  const fromCrawl = meta.generated_from?.find((u) => typeof u === 'string' && u.startsWith('http'));
  const base = websiteUrl?.trim() || fromCrawl?.trim() || 'https://example.com';

  const colors = (meta.colors ?? []).map((c) => c.hex).filter(Boolean);
  const primaryLogo = meta.logos?.[0];
  const logoUrl = absUrl(primaryLogo?.url ?? null, base);

  const descriptionParts = [
    meta.tone_primary,
    meta.target_audience_summary,
    meta.competitive_positioning,
  ].filter(Boolean);
  const description = descriptionParts.join(' ').slice(0, 500) || `${clientName} brand`;

  const brand: ScrapedBrand = {
    name: clientName,
    logoUrl,
    colors: colors.length > 0 ? colors : ['#6366f1'],
    description,
    url: base,
  };

  const products: ScrapedProduct[] = (meta.products ?? []).map((p) => ({
    name: p.name ?? 'Product',
    imageUrl: absUrl(p.imageUrl ?? null, base),
    description: p.description ?? '',
    price: p.price ?? null,
  }));

  const mediaUrls: string[] = [];
  for (const l of meta.logos ?? []) {
    const u = absUrl(l.url, base);
    if (u && !mediaUrls.includes(u)) mediaUrls.push(u);
  }
  for (const s of meta.screenshots ?? []) {
    const u = absUrl(s.url, base);
    if (u && !mediaUrls.includes(u)) mediaUrls.push(u);
  }
  for (const p of products) {
    if (p.imageUrl && !mediaUrls.includes(p.imageUrl)) mediaUrls.push(p.imageUrl);
  }

  return { brand, products, mediaUrls };
}
