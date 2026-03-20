import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractMeta } from '@/lib/ad-creatives/scrape-brand';

const bodySchema = z.object({
  url: z.string().url(),
  sourceBrand: z.string().max(200).optional(),
});

/**
 * POST /api/ad-creatives/templates/import-url
 *
 * Extract an image from a social media post URL (Instagram, Facebook, etc.)
 * and save it as a template.
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

  const { url, sourceBrand } = parsed.data;

  try {
    // Fetch the page to extract OG image
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch URL (${res.status})` }, { status: 400 });
    }

    const html = await res.text();

    // Extract the primary image
    const imageUrl =
      extractMeta(html, 'og:image') ??
      extractMeta(html, 'twitter:image') ??
      extractMeta(html, 'twitter:image:src');

    if (!imageUrl) {
      return NextResponse.json({ error: 'No image found on this page' }, { status: 404 });
    }

    // Extract the page/account name for source_brand
    const pageName =
      sourceBrand ??
      extractMeta(html, 'og:site_name') ??
      extractMeta(html, 'og:title') ??
      new URL(url).hostname;

    // Determine aspect ratio by fetching the image headers (or default to 1:1)
    const aspectRatio = await detectAspectRatio(imageUrl);

    // Save as a template
    const admin = createAdminClient();
    const { data: template, error } = await admin
      .from('kandy_templates')
      .insert({
        collection_name: 'Imported',
        image_url: imageUrl.replace(/^http:\/\//, 'https://'),
        source_brand: pageName,
        aspect_ratio: aspectRatio,
        is_active: true,
        vertical: null,
        ad_category: null,
      })
      .select('id, image_url, collection_name, source_brand, aspect_ratio')
      .single();

    if (error) {
      console.error('[import-url] Failed to save template:', error);
      return NextResponse.json({ error: 'Failed to save template' }, { status: 500 });
    }

    return NextResponse.json({ template });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 },
    );
  }
}

async function detectAspectRatio(imageUrl: string): Promise<string> {
  // Try to detect aspect ratio from the image dimensions
  // For now, default to 1:1 — in production we'd fetch image metadata
  try {
    const res = await fetch(imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return '1:1';
    // Without actually loading the image, we can't determine dimensions from headers
    // Default to 1:1 — the user can change this in template editing
    return '1:1';
  } catch {
    return '1:1';
  }
}
