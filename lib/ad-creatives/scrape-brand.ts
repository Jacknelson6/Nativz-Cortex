// ---------------------------------------------------------------------------
// Lightweight brand + product scraper for the ad wizard
// ---------------------------------------------------------------------------

export type ScrapedBrand = {
  name: string;
  logoUrl: string | null;
  colors: string[];
  description: string;
  url: string;
};

export type ScrapedProduct = {
  name: string;
  imageUrl: string | null;
  description: string;
  price: string | null;
};

export type ScrapeBrandResult = {
  brand: ScrapedBrand;
  products: ScrapedProduct[];
};

/**
 * Fetches the given URL and extracts lightweight brand info + product listings.
 * This is NOT a full Brand DNA generation — just enough to populate the wizard.
 */
export async function scrapeBrandAndProducts(url: string): Promise<ScrapeBrandResult> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL (${res.status})`);
  }

  const html = await res.text();
  const brand = extractBrand(html, url);
  const products = extractProducts(html);

  // Rewrite http:// URLs to https:// for CSP compliance
  if (brand.logoUrl) {
    brand.logoUrl = brand.logoUrl.replace(/^http:\/\//, 'https://');
  }

  // Filter out non-product scrape artifacts and sanitize URLs
  const ARTIFACT_PATTERNS = /load video|play video|watch/i;
  const cleanProducts = products
    .filter((p) => p.imageUrl) // must have an image
    .filter((p) => p.name.length >= 3) // name must be at least 3 chars
    .filter((p) => !ARTIFACT_PATTERNS.test(p.name)) // filter video artifacts
    .map((p) => ({
      ...p,
      imageUrl: p.imageUrl ? p.imageUrl.replace(/^http:\/\//, 'https://') : null,
    }));

  return { brand, products: cleanProducts };
}

// ---------------------------------------------------------------------------
// Brand extraction
// ---------------------------------------------------------------------------

function extractBrand(html: string, url: string): ScrapedBrand {
  const name =
    extractMeta(html, 'og:site_name') ??
    extractMeta(html, 'og:title') ??
    extractTitle(html) ??
    new URL(url).hostname.replace(/^www\./, '');

  const logoUrl =
    extractLinkIcon(html, url) ??
    extractMeta(html, 'og:image') ??
    null;

  const description =
    extractMeta(html, 'og:description') ??
    extractMeta(html, 'description') ??
    '';

  const colors = extractColors(html);

  return { name, logoUrl, colors, description, url };
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

function extractMeta(html: string, nameOrProperty: string): string | null {
  // Try property= (OG tags)
  const propRegex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapeRegex(nameOrProperty)}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  let match = html.match(propRegex);
  if (match) return decodeEntities(match[1].trim());

  // Try content= before property= (reversed attribute order)
  const reversedRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegex(nameOrProperty)}["']`,
    'i',
  );
  match = html.match(reversedRegex);
  if (match) return decodeEntities(match[1].trim());

  return null;
}

function extractLinkIcon(html: string, baseUrl: string): string | null {
  // Look for apple-touch-icon first (usually higher res), then icon
  const patterns = [
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i,
    /<link[^>]+rel=["']icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']icon["']/i,
    /<link[^>]+rel=["']shortcut icon["'][^>]+href=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return resolveUrl(match[1], baseUrl);
    }
  }
  return null;
}

function extractColors(html: string): string[] {
  const colors = new Set<string>();

  // Theme color meta tag
  const themeColor = extractMeta(html, 'theme-color');
  if (themeColor) colors.add(themeColor);

  // MS tile color
  const msColor = extractMeta(html, 'msapplication-TileColor');
  if (msColor) colors.add(msColor);

  // Inline style hex colors (limit to first few unique ones)
  const hexMatches = html.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/g);
  if (hexMatches) {
    const unique = [...new Set(hexMatches)].filter(
      (c) => !['#000', '#000000', '#fff', '#ffffff', '#FFF', '#FFFFFF'].includes(c),
    );
    for (const c of unique.slice(0, 6)) {
      colors.add(c.toLowerCase());
    }
  }

  return [...colors].slice(0, 8);
}

// ---------------------------------------------------------------------------
// Product extraction
// ---------------------------------------------------------------------------

function extractProducts(html: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];

  // 1. Try JSON-LD structured data first
  const jsonLdProducts = extractJsonLdProducts(html);
  if (jsonLdProducts.length > 0) return jsonLdProducts.slice(0, 20);

  // 2. Try OG product tags
  const ogProduct = extractOgProduct(html);
  if (ogProduct) products.push(ogProduct);

  // 3. Heuristic: look for product-like image+text patterns
  const heuristicProducts = extractHeuristicProducts(html);
  products.push(...heuristicProducts);

  // Deduplicate by name
  const seen = new Set<string>();
  return products
    .filter((p) => {
      const key = p.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function extractJsonLdProducts(html: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : data['@graph'] ?? [data];

      for (const item of items) {
        if (
          item['@type'] === 'Product' ||
          item['@type'] === 'MenuItem' ||
          item['@type'] === 'IndividualProduct'
        ) {
          products.push({
            name: item.name ?? '',
            imageUrl: Array.isArray(item.image) ? item.image[0] : (item.image ?? null),
            description: item.description ?? '',
            price: extractJsonLdPrice(item),
          });
        }

        // Handle ItemList with products
        if (item['@type'] === 'ItemList' && Array.isArray(item.itemListElement)) {
          for (const listItem of item.itemListElement) {
            const product = listItem.item ?? listItem;
            if (product.name) {
              products.push({
                name: product.name,
                imageUrl: Array.isArray(product.image) ? product.image[0] : (product.image ?? null),
                description: product.description ?? '',
                price: extractJsonLdPrice(product),
              });
            }
          }
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }

  return products;
}

function extractJsonLdPrice(item: Record<string, unknown>): string | null {
  const offers = item.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
  if (!offers) return null;

  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (!offer) return null;

  const price = offer.price ?? offer.lowPrice;
  const currency = (offer.priceCurrency as string) ?? 'USD';

  if (price !== undefined && price !== null) {
    return `${currency} ${price}`;
  }
  return null;
}

function extractOgProduct(html: string): ScrapedProduct | null {
  const ogType = extractMeta(html, 'og:type');
  if (ogType !== 'product' && ogType !== 'og:product') return null;

  const name = extractMeta(html, 'og:title');
  if (!name) return null;

  return {
    name,
    imageUrl: extractMeta(html, 'og:image') ?? null,
    description: extractMeta(html, 'og:description') ?? '',
    price:
      extractMeta(html, 'product:price:amount') ??
      extractMeta(html, 'og:price:amount') ??
      null,
  };
}

function extractHeuristicProducts(html: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];

  // Look for images with alt text containing product-like keywords
  const imgRegex = /<img[^>]+alt=["']([^"']{5,80})["'][^>]+src=["']([^"']+)["'][^>]*>/gi;
  const imgRegexReversed = /<img[^>]+src=["']([^"']+)["'][^>]+alt=["']([^"']{5,80})["'][^>]*>/gi;

  const productKeywords = /product|shop|buy|price|item|collection|menu|dish|meal|offer/i;

  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const alt = decodeEntities(imgMatch[1]);
    if (productKeywords.test(alt) || productKeywords.test(getContext(html, imgMatch.index, 200))) {
      products.push({
        name: alt,
        imageUrl: imgMatch[2],
        description: '',
        price: null,
      });
    }
  }

  while ((imgMatch = imgRegexReversed.exec(html)) !== null) {
    const alt = decodeEntities(imgMatch[2]);
    const src = imgMatch[1];
    if (
      !products.some((p) => p.imageUrl === src) &&
      (productKeywords.test(alt) || productKeywords.test(getContext(html, imgMatch.index, 200)))
    ) {
      products.push({
        name: alt,
        imageUrl: src,
        description: '',
        price: null,
      });
    }
  }

  return products;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getContext(html: string, index: number, range: number): string {
  const start = Math.max(0, index - range);
  const end = Math.min(html.length, index + range);
  return html.slice(start, end);
}
