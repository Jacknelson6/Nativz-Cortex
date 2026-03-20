// ---------------------------------------------------------------------------
// Rich product hints from HTML (microdata, schema.org, common card patterns)
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio';
import type { ScrapedProduct } from './scrape-brand';

function resolveUrl(href: string, baseUrl: string): string | null {
  if (!href || href.startsWith('data:')) return null;
  try {
    return new URL(href, baseUrl).href.replace(/^http:\/\//, 'https://');
  } catch {
    return null;
  }
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Products from schema.org JSON-LD, microdata, and figure/card heuristics.
 */
export function extractRichProducts(html: string, baseUrl: string): ScrapedProduct[] {
  const $ = cheerio.load(html);
  const out: ScrapedProduct[] = [];
  const seen = new Set<string>();

  function add(p: ScrapedProduct) {
    const key = `${p.name.toLowerCase()}|${p.imageUrl ?? ''}`;
    if (!p.name || p.name.length < 2 || seen.has(key)) return;
    seen.add(key);
    out.push(p);
  }

  // Microdata Product
  $('[itemtype*="schema.org/Product"], [itemtype*="https://schema.org/Product"]').each((_, el) => {
    const scope = $(el);
    const name =
      cleanText(scope.find('[itemprop="name"]').first().text()) ||
      cleanText(scope.find('h1, h2, h3').first().text());
    if (!name || name.length < 2) return;
    const img =
      scope.find('[itemprop="image"]').attr('src') ??
      scope.find('[itemprop="image"]').attr('href') ??
      scope.find('img[itemprop="image"]').attr('src') ??
      scope.find('img').first().attr('src');
    const desc = cleanText(scope.find('[itemprop="description"]').first().text());
    const priceEl = scope.find('[itemprop="price"]').first();
    const price =
      priceEl.attr('content') ?? cleanText(priceEl.text()) ?? null;
    add({
      name,
      imageUrl: img ? resolveUrl(img, baseUrl) : null,
      description: desc,
      price: price && price.length > 0 ? price : null,
    });
  });

  // WooCommerce / generic product grids
  $('li.product, article.product, [class*="product-card"], [data-product-id]').each((_, el) => {
    const scope = $(el);
    const name =
      cleanText(scope.find('.woocommerce-loop-product__title, .product-title, h2, h3').first().text()) ||
      cleanText(scope.find('a').first().text());
    if (!name || name.length < 3) return;
    const img = scope.find('img').first().attr('src') ?? scope.find('img').first().attr('data-src');
    const desc = cleanText(scope.find('.description, p.excerpt, .product-excerpt').first().text());
    const price = cleanText(scope.find('.price, .amount, [class*="price"]').first().text()) || null;
    add({
      name: name.slice(0, 200),
      imageUrl: img ? resolveUrl(img, baseUrl) : null,
      description: desc.slice(0, 500),
      price,
    });
  });

  // Figure + figcaption (editorial / menu style)
  $('figure').each((_, el) => {
    const scope = $(el);
    const cap = cleanText(scope.find('figcaption').first().text());
    if (!cap || cap.length < 4) return;
    const img = scope.find('img').first().attr('src');
    add({
      name: cap.slice(0, 120),
      imageUrl: img ? resolveUrl(img, baseUrl) : null,
      description: cap.length > 120 ? cap : '',
      price: null,
    });
  });

  return out.slice(0, 30);
}
