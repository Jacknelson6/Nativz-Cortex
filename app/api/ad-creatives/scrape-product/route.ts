import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { extractProducts } from '@/lib/ad-creatives/scrape-brand';

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
    const res = await fetch(parsed.data.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch URL (${res.status})` }, { status: 400 });
    }

    const html = await res.text();
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
