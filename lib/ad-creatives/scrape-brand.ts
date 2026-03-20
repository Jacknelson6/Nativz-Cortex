// ---------------------------------------------------------------------------
// Lightweight brand + product scraper for the ad wizard
// ---------------------------------------------------------------------------

export type BusinessType = 'ecommerce' | 'restaurant' | 'service' | 'saas' | 'general';

export type ScrapedBrand = {
  name: string;
  logoUrl: string | null;
  colors: string[];
  description: string;
  url: string;
  businessType: BusinessType;
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
  const businessType = detectBusinessType(html, url);
  const brand = extractBrand(html, url, businessType);

  let products: ScrapedProduct[];
  if (businessType === 'restaurant') {
    products = extractMenuItems(html, url);
  } else if (businessType === 'service' || businessType === 'saas') {
    products = extractServiceItems(html, url);
  } else {
    products = extractProducts(html, url);
  }

  // Rewrite http:// URLs to https:// for CSP compliance
  if (brand.logoUrl) {
    brand.logoUrl = brand.logoUrl.replace(/^http:\/\//, 'https://');
  }

  // Filter out non-product scrape artifacts and sanitize URLs
  const ARTIFACT_PATTERNS = /load video|play video|watch/i;
  const cleanProducts = products
    .filter((p) => p.imageUrl || p.description) // must have image or description
    .filter((p) => p.name.length >= 3) // name must be at least 3 chars
    .filter((p) => !ARTIFACT_PATTERNS.test(p.name)) // filter video artifacts
    .map((p) => ({
      ...p,
      imageUrl: p.imageUrl ? p.imageUrl.replace(/^http:\/\//, 'https://') : null,
    }));

  return { brand, products: cleanProducts };
}

// ---------------------------------------------------------------------------
// Business type detection
// ---------------------------------------------------------------------------

export function detectBusinessType(html: string, url: string): BusinessType {
  const lower = html.toLowerCase();
  const urlLower = url.toLowerCase();

  // URL-based hints (strongest signal)
  if (/\/(menu|food|eat|restaurant|cafe|bistro)/.test(urlLower)) return 'restaurant';
  if (/\/(services|solutions|what-we-do)/.test(urlLower)) return 'service';

  const restaurantSignals = [
    /\bmenu\b/, /\bdish(es)?\b/, /\bmeal(s)?\b/, /\bappetizer/, /\bentree/,
    /\brestaurant/, /\bcafe\b/, /\bcafé\b/, /\bbistro\b/, /\bfood truck\b/,
    /\bdelivery|doordash|ubereats|grubhub/, /\bbreakfast|lunch|dinner|brunch\b/,
    /\bvegan|vegetarian|gluten.free\b/,
  ];
  const serviceSignals = [
    /\bour services\b/, /\bwhat we do\b/, /\bwe offer\b/, /\bget a quote\b/,
    /\bfree consultation\b/, /\blaw firm|attorney|lawyer\b/,
    /\breal estate|realtor|property\b/, /\bhvac|plumb|electric|contrac\b/,
    /\baccounting|cpa|tax prep\b/, /\binsurance|financial advisor\b/,
    /\bcleaning service|landscap\b/, /\bmedical|dental|therapy|clinic\b/,
  ];
  const saasSignals = [
    /\bfree trial\b/, /\bsign up free\b/, /\bsubscription\b/, /\bplatform\b/,
    /\bdashboard\b/, /\bapi\b/, /\bintegration(s)?\b/, /\bsoftware\b/,
    /\bautomat(e|ion)\b/,
  ];
  const ecommerceSignals = [
    /\badd to cart\b/, /\bshop now\b/, /\bbuy now\b/, /\bcheckout\b/,
    /\bfree shipping\b/, /\bproduct(s)?\b/, /\bcollection(s)?\b/,
    /shopify|woocommerce|bigcommerce/,
  ];

  const scores: [BusinessType, number][] = [
    ['restaurant', restaurantSignals.filter((r) => r.test(lower)).length],
    ['service', serviceSignals.filter((r) => r.test(lower)).length],
    ['saas', saasSignals.filter((r) => r.test(lower)).length],
    ['ecommerce', ecommerceSignals.filter((r) => r.test(lower)).length],
  ];

  const [topType, topScore] = scores.reduce((best, curr) => (curr[1] > best[1] ? curr : best));
  if (topScore >= 2) return topType;
  if (topScore === 1 && topType === 'restaurant') return 'restaurant';
  return 'general';
}

// ---------------------------------------------------------------------------
// Brand extraction
// ---------------------------------------------------------------------------

function extractBrand(html: string, url: string, businessType: BusinessType): ScrapedBrand {
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

  return { name, logoUrl, colors, description, url, businessType };
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

export function extractMeta(html: string, nameOrProperty: string): string | null {
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

export function extractColors(html: string): string[] {
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
// Product extraction (ecommerce / general)
// ---------------------------------------------------------------------------

export function extractProducts(html: string, baseUrl?: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];

  // 1. Try JSON-LD structured data first
  const jsonLdProducts = extractJsonLdProducts(html, baseUrl);
  if (jsonLdProducts.length > 0) return jsonLdProducts.slice(0, 20);

  // 2. Try OG product tags
  const ogProduct = extractOgProduct(html, baseUrl);
  if (ogProduct) products.push(ogProduct);

  // 3. Heuristic: look for product-like image+text patterns
  const heuristicProducts = extractHeuristicProducts(html, baseUrl);
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

// ---------------------------------------------------------------------------
// Restaurant menu item extraction
// ---------------------------------------------------------------------------

export function extractMenuItems(html: string, baseUrl?: string): ScrapedProduct[] {
  const items: ScrapedProduct[] = [];

  // 1. JSON-LD MenuItem / FoodEstablishment / Menu
  const jsonLdItems = extractJsonLdMenuItems(html, baseUrl);
  if (jsonLdItems.length > 0) return jsonLdItems.slice(0, 30);

  // 2. Heuristic: look for price-tagged images near food keywords
  const heuristicItems = extractHeuristicMenuItems(html, baseUrl);
  items.push(...heuristicItems);

  // 3. Fallback to general heuristic with food keywords
  if (items.length < 3) {
    items.push(...extractHeuristicProducts(html, baseUrl, true));
  }

  const seen = new Set<string>();
  return items
    .filter((p) => {
      const key = p.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}

function extractJsonLdMenuItems(html: string, baseUrl?: string): ScrapedProduct[] {
  const items: ScrapedProduct[] = [];
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const nodes = Array.isArray(data) ? data : data['@graph'] ?? [data];

      for (const node of nodes) {
        // FoodEstablishment with hasMenu
        if (node.hasMenu) {
          const sections = (node.hasMenu.hasMenuSection ?? []) as Record<string, unknown>[];
          for (const section of Array.isArray(sections) ? sections : [sections]) {
            const menuItems = (section.hasMenuItem ?? []) as Record<string, unknown>[];
            for (const item of Array.isArray(menuItems) ? menuItems : [menuItems]) {
              const typedItem = item as Record<string, unknown>;
              if (typedItem.name) {
                items.push({
                  name: typedItem.name as string,
                  imageUrl: resolveImageUrl(
                    (Array.isArray(typedItem.image) ? typedItem.image[0] : typedItem.image) as string | null,
                    baseUrl,
                  ),
                  description: (typedItem.description as string) ?? '',
                  price: extractJsonLdPrice(typedItem),
                });
              }
            }
          }
        }

        // Direct MenuItem
        if (node['@type'] === 'MenuItem' && node.name) {
          items.push({
            name: node.name as string,
            imageUrl: resolveImageUrl(
              (Array.isArray(node.image) ? node.image[0] : node.image) as string | null,
              baseUrl,
            ),
            description: (node.description as string) ?? '',
            price: extractJsonLdPrice(node as Record<string, unknown>),
          });
        }
      }
    } catch {
      // Invalid JSON-LD
    }
  }

  return items;
}

function extractHeuristicMenuItems(html: string, baseUrl?: string): ScrapedProduct[] {
  const items: ScrapedProduct[] = [];
  const pricePattern = /\$\d+(?:\.\d{2})?/;
  const imgTagRegex = /<img([^>]+)>/gi;
  let imgMatch;

  while ((imgMatch = imgTagRegex.exec(html)) !== null) {
    const context = getContext(html, imgMatch.index, 300);
    if (!pricePattern.test(context)) continue;

    const imageUrl = resolveImageUrl(extractImgSrc(imgMatch[0]), baseUrl);
    if (!imageUrl) continue;

    const nameMatch = context.match(/<(?:h[1-6]|p|span|div)[^>]*>([^<]{3,60})<\/(?:h[1-6]|p|span|div)>/i);
    const priceMatch = context.match(pricePattern);

    if (nameMatch) {
      items.push({
        name: decodeEntities(nameMatch[1].trim()),
        imageUrl,
        description: '',
        price: priceMatch ? priceMatch[0] : null,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Service item extraction
// ---------------------------------------------------------------------------

export function extractServiceItems(html: string, baseUrl?: string): ScrapedProduct[] {
  const items: ScrapedProduct[] = [];

  // JSON-LD Service type
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const nodes = Array.isArray(data) ? data : data['@graph'] ?? [data];
      for (const node of nodes) {
        if (node['@type'] === 'Service' && node.name) {
          items.push({
            name: node.name as string,
            imageUrl: resolveImageUrl(
              (Array.isArray(node.image) ? node.image[0] : node.image) as string | null,
              baseUrl,
            ),
            description: (node.description as string) ?? '',
            price: null,
          });
        }
      }
    } catch {
      // Invalid JSON-LD
    }
  }

  if (items.length > 0) return items.slice(0, 20);

  // Heuristic: look for service cards — heading + image + short description
  const serviceKeywords = /\b(service|solution|offer|speciali[sz]e|provid|support|consult|manag)\b/i;
  const headingRegex = /<h[2-4][^>]*>([^<]{5,80})<\/h[2-4]>/gi;
  let headingMatch;

  while ((headingMatch = headingRegex.exec(html)) !== null) {
    const heading = decodeEntities(headingMatch[1].trim());
    const context = getContext(html, headingMatch.index, 500);
    if (!serviceKeywords.test(heading) && !serviceKeywords.test(context)) continue;

    const imgInContext = context.match(/<img([^>]+)>/i);
    const imageUrl = imgInContext
      ? resolveImageUrl(extractImgSrc(imgInContext[0]), baseUrl)
      : null;

    const descMatch = context.match(/<p[^>]*>([^<]{10,200})<\/p>/i);
    const description = descMatch ? decodeEntities(descMatch[1].trim()) : '';

    if (!items.some((s) => s.name === heading)) {
      items.push({ name: heading, imageUrl, description, price: null });
    }
  }

  return items.slice(0, 20);
}

// ---------------------------------------------------------------------------
// JSON-LD product extraction (ecommerce)
// ---------------------------------------------------------------------------

function extractJsonLdProducts(html: string, baseUrl?: string): ScrapedProduct[] {
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
            imageUrl: resolveImageUrl(
              Array.isArray(item.image) ? item.image[0] : item.image,
              baseUrl,
            ),
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
                imageUrl: resolveImageUrl(
                  Array.isArray(product.image) ? product.image[0] : product.image,
                  baseUrl,
                ),
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

function extractOgProduct(html: string, baseUrl?: string): ScrapedProduct | null {
  const ogType = extractMeta(html, 'og:type');
  if (ogType !== 'product' && ogType !== 'og:product') return null;

  const name = extractMeta(html, 'og:title');
  if (!name) return null;

  return {
    name,
    imageUrl: resolveImageUrl(extractMeta(html, 'og:image'), baseUrl),
    description: extractMeta(html, 'og:description') ?? '',
    price:
      extractMeta(html, 'product:price:amount') ??
      extractMeta(html, 'og:price:amount') ??
      null,
  };
}

function extractHeuristicProducts(html: string, baseUrl?: string, includeFood = false): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const productKeywords = includeFood
    ? /product|shop|buy|price|item|collection|menu|dish|meal|offer|food|eat/i
    : /product|shop|buy|price|item|collection|menu|dish|meal|offer/i;

  // Match all <img> tags, including lazy-loaded variants
  const imgTagRegex = /<img([^>]+)>/gi;
  let imgMatch;

  while ((imgMatch = imgTagRegex.exec(html)) !== null) {
    const attrs = imgMatch[1];
    const altMatch = attrs.match(/\balt=["']([^"']{5,80})["']/i);
    if (!altMatch) continue;
    const alt = decodeEntities(altMatch[1]);

    const context = getContext(html, imgMatch.index, 200);
    if (!productKeywords.test(alt) && !productKeywords.test(context)) continue;

    const imageUrl = resolveImageUrl(extractImgSrc(imgMatch[0]), baseUrl);
    if (!imageUrl) continue;

    if (!products.some((p) => p.imageUrl === imageUrl)) {
      products.push({ name: alt, imageUrl, description: '', price: null });
    }
  }

  return products;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the best image src from an <img> tag string.
 * Prefers actual src, falls back to lazy-load attributes (data-src, data-lazy-src, etc.).
 */
function extractImgSrc(imgTag: string): string | null {
  // Try real src (skip data: URIs)
  const srcMatch = imgTag.match(/\bsrc=["'](?!data:)([^"']+)["']/i);
  if (srcMatch) return srcMatch[1];

  // Lazy-load attribute fallbacks
  for (const attr of ['data-src', 'data-lazy-src', 'data-lazy', 'data-original', 'data-srcset']) {
    const lazyMatch = imgTag.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, 'i'));
    if (lazyMatch) {
      // data-srcset may be "url1 1x, url2 2x" — take first URL
      return lazyMatch[1].split(',')[0].trim().split(' ')[0];
    }
  }
  return null;
}

/**
 * Resolves an image URL to absolute and converts http to https.
 */
function resolveImageUrl(url: string | null | undefined, baseUrl?: string): string | null {
  if (!url) return null;
  try {
    const resolved = baseUrl ? new URL(url, baseUrl).href : url;
    return resolved.replace(/^http:\/\//, 'https://');
  } catch {
    return null;
  }
}

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
