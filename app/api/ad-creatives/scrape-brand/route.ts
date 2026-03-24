import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { rateLimitByUser } from '@/lib/security/rate-limit';
import { scrapeBrandAndProducts } from '@/lib/ad-creatives/scrape-brand';

export const maxDuration = 180;

const bodySchema = z.object({
  url: z
    .string()
    .url('Must be a valid URL')
    .refine(
      (u) => u.startsWith('http://') || u.startsWith('https://'),
      'URL must start with http:// or https://',
    ),
});

/**
 * POST /api/ad-creatives/scrape-brand
 *
 * Lightweight scrape of a website to extract brand info and products
 * for the ad generation wizard.
 *
 * @auth Required
 * @body url - Website URL to scrape
 * @returns {{ brand, products }}
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit
  const rl = rateLimitByUser(user.id, '/api/ad-creatives/scrape-brand', 'regular');
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await scrapeBrandAndProducts(parsed.data.url);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Brand scrape failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to scrape URL' },
      { status: 422 },
    );
  }
}
