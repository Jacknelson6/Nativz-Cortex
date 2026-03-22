// ---------------------------------------------------------------------------
// Rich product hints from HTML (microdata, schema.org, common card patterns)
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio';
import type { ScrapedProduct } from './scrape-brand';
import { isJunkProductName } from './product-name-filters';

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

type ImgSelection = { attr(name: string): string | undefined };

/** Lazy-loaded and srcset images (Shopify, Webflow, etc.) */
function pickImgSrc($img: ImgSelection, baseUrl: string): string | null {
  const candidates = [
    $img.attr('data-src'),
    $img.attr('data-lazy-src'),
    $img.attr('data-original'),
    $img.attr('data-image'),
    $img.attr('src'),
  ].filter(Boolean) as string[];
  const srcset = $img.attr('srcset') ?? $img.attr('data-srcset');
  if (srcset) {
    const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
    if (first) candidates.unshift(first);
  }
  for (const raw of candidates) {
    const u = resolveUrl(raw, baseUrl);
    if (u && !u.startsWith('data:')) return u;
  }
  return null;
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
    if (isJunkProductName(p.name)) return;
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
    const imgEl = scope.find('img[itemprop="image"]').first().length
      ? scope.find('img[itemprop="image"]').first()
      : scope.find('img').first();
    const img =
      scope.find('[itemprop="image"]').attr('href') ??
      (imgEl.length ? pickImgSrc(imgEl, baseUrl) : null);
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

  // WooCommerce / Shopify product cards (avoid overly broad [class*="product-card"] alone)
  $('li.product, article.product, [data-product-id], .product-item, .product-card').each((_, el) => {
    const scope = $(el);
    const name =
      cleanText(scope.find('.woocommerce-loop-product__title, .product-title, .product__title, h2, h3').first().text()) ||
      cleanText(scope.find('a[href*="/products/"], a[href*="/product/"]').first().text());
    if (!name || name.length < 3) return;
    const $img = scope.find('img').first();
    const img = $img.length ? pickImgSrc($img, baseUrl) : null;
    const desc = cleanText(scope.find('.description, p.excerpt, .product-excerpt').first().text());
    const price = cleanText(scope.find('.price, .amount, [class*="price"]').first().text()) || null;
    add({
      name: name.slice(0, 200),
      imageUrl: img,
      description: desc.slice(0, 500),
      price,
    });
  });

  // Figure + figcaption — only when caption reads like a product title (skip icon-only figures)
  $('figure').each((_, el) => {
    const scope = $(el);
    const cap = cleanText(scope.find('figcaption').first().text());
    if (!cap || cap.length < 8 || cap.length > 140) return;
    if (/\b(mg|vegan|gluten|gmo|off|%\s*off|free shipping)\b/i.test(cap) && cap.length < 40) return;
    const $img = scope.find('img').first();
    const img = $img.length ? pickImgSrc($img, baseUrl) : null;
    add({
      name: cap.slice(0, 120),
      imageUrl: img,
      description: cap.length > 120 ? cap : '',
      price: null,
    });
  });

  return out.slice(0, 30);
}
