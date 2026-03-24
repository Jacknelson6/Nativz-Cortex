import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { extractProducts } from '@/lib/ad-creatives/scrape-brand';
import { fetchHtmlForBrandScrape } from '@/lib/ad-creatives/fetch-page-for-scrape';

export const maxDuration = 180;

const bodySchema = z.object({
  url: z.string().url(),
});

/**
 * POST /api/ad-creatives/scrape-product
 *
 * Scrape a single page for product data only (no brand extraction).
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  try {
    const html = await fetchHtmlForBrandScrape(parsed.data.url);
    const products = extractProducts(html, parsed.data.url);

    // Return the first product found, with URL-sanitized image
    const product = products[0] ?? null;
    if (product?.imageUrl) {
      product.imageUrl = product.imageUrl.replace(/^http:\/\//, 'https://');
    }

    return NextResponse.json({ product });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scrape failed' },
      { status: 500 },
    );
  }
}
