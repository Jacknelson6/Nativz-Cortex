import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateFileSignature } from '@/lib/security/validate-file-type';
import { extractAdPrompt } from '@/lib/ad-creatives/extract-prompt';
import { extractMetaAdLibraryImageUrls, isMetaAdLibraryUrl } from '@/lib/ad-creatives/extract-ad-library-urls';
import { rateLimitByUser } from '@/lib/security/rate-limit';

export const maxDuration = 300;

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGES = 50;
const IMAGE_DOWNLOAD_TIMEOUT = 10_000; // 10 seconds per image

const bodySchema = z.object({
  url: z.string().url('Must be a valid URL'),
  ad_category: z.string().min(1, 'Ad category is required'),
});

/**
 * Extract image URLs from HTML content.
 * Looks for <img> src attributes and <source> srcset attributes.
 * Filters to images likely to be ads based on size attributes and URL patterns.
 */
function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();

  // Match <img> tags with src attribute
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    const fullTag = match[0];

    // Check for size attributes — skip tiny images (icons, spacers)
    const widthMatch = fullTag.match(/width=["']?(\d+)/i);
    const heightMatch = fullTag.match(/height=["']?(\d+)/i);
    const width = widthMatch ? parseInt(widthMatch[1], 10) : null;
    const height = heightMatch ? parseInt(heightMatch[1], 10) : null;

    // Skip images with explicit small dimensions
    if ((width !== null && width < 200) || (height !== null && height < 200)) {
      continue;
    }

    // Skip common non-ad patterns
    if (isLikelyNonAd(src)) continue;

    urls.add(src);
  }

  // Match <source> tags (picture element)
  const sourceRegex = /<source[^>]+srcset=["']([^"',\s]+)/gi;
  while ((match = sourceRegex.exec(html)) !== null) {
    const src = match[1];
    if (!isLikelyNonAd(src)) {
      urls.add(src);
    }
  }

  // Match og:image and twitter:image meta tags
  const metaRegex = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
  while ((match = metaRegex.exec(html)) !== null) {
    urls.add(match[1]);
  }

  // Resolve relative URLs
  const resolved: string[] = [];
  for (const url of urls) {
    try {
      const absolute = new URL(url, baseUrl).href;
      // Only keep http/https URLs with image-like extensions or CDN patterns
      if (absolute.startsWith('http') && isLikelyImage(absolute)) {
        resolved.push(absolute);
      }
    } catch {
      // Skip malformed URLs
    }
  }

  return resolved.slice(0, MAX_IMAGES);
}

function isLikelyNonAd(src: string): boolean {
  const lower = src.toLowerCase();
  return (
    lower.includes('favicon') ||
    lower.includes('logo') ||
    lower.includes('icon') ||
    lower.includes('avatar') ||
    lower.includes('emoji') ||
    lower.includes('pixel') ||
    lower.includes('tracking') ||
    lower.includes('spacer') ||
    lower.includes('1x1') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.gif') ||
    lower.includes('data:image')
  );
}

function isLikelyImage(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('.jpg') ||
    lower.includes('.jpeg') ||
    lower.includes('.png') ||
    lower.includes('.webp') ||
    lower.includes('image') ||
    lower.includes('photo') ||
    lower.includes('creative') ||
    lower.includes('media') ||
    lower.includes('cdn') ||
    lower.includes('scontent') // Facebook CDN
  );
}

/**
 * POST /api/clients/[id]/ad-creatives/templates/scrape
 *
 * Scrape ad images from a URL. Fetches the page HTML, extracts image URLs,
 * downloads qualifying images, uploads to storage, and creates template records.
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @body url - URL to scrape
 * @body ad_category - Ad category for all imported templates
 * @returns {{ found: number, imported: number, templates: Array<{ id: string, name: string }>, errors: string[] }}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Stricter rate limit for scrape endpoint
    const rl = rateLimitByUser(user.id, '/api/clients/ad-creatives/templates/scrape', 'ai');
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { url, ad_category } = parsed.data;

    const admin = createAdminClient();

    // Verify client exists
    const { data: client } = await admin.from('clients').select('id').eq('id', clientId).single();
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    // Fetch the page HTML
    let html: string;
    try {
      const pageResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!pageResponse.ok) {
        return NextResponse.json(
          { error: `Failed to fetch page: HTTP ${pageResponse.status}` },
          { status: 422 },
        );
      }

      html = await pageResponse.text();
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';
      return NextResponse.json(
        { error: `Failed to fetch page: ${message}` },
        { status: 422 },
      );
    }

    // Extract image URLs from HTML (Meta Ad Library: CDN URLs often appear in initial HTML)
    let imageUrls = isMetaAdLibraryUrl(url)
      ? extractMetaAdLibraryImageUrls(html)
      : extractImageUrls(html, url);

    if (imageUrls.length === 0) {
      imageUrls = extractImageUrls(html, url);
    }

    if (imageUrls.length === 0) {
      return NextResponse.json({
        found: 0,
        imported: 0,
        templates: [],
        errors: [
          isMetaAdLibraryUrl(url)
            ? 'No static ad images found in this page response. Meta Ad Library often loads creatives in the browser — try again after the page fully loads in your browser, export screenshots, or use bulk image upload.'
            : 'No qualifying ad images found on this page. The page may load images via JavaScript which cannot be scraped. Try downloading the images manually and using bulk upload instead.',
        ],
      });
    }

    let scrapeJobId: string | null = null;
    try {
      const { data: jobRow, error: jobInsErr } = await admin
        .from('ad_library_scrape_jobs')
        .insert({
          user_id: user.id,
          client_id: clientId,
          library_url: url,
          status: 'scraping',
        })
        .select('id')
        .single();
      if (!jobInsErr && jobRow?.id) scrapeJobId = jobRow.id;
    } catch {
      // Optional migration 055 — ignore if client_id column missing
    }

    // Download and import each image
    const templates: { id: string; name: string }[] = [];
    const errors: string[] = [];
    const templateIdsForExtraction: { id: string; imageUrl: string }[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const imgUrl = imageUrls[i];

      try {
        // Download the image
        const imgResponse = await fetch(imgUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            Referer: url,
          },
          signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT),
        });

        if (!imgResponse.ok) {
          errors.push(`Failed to download image ${i + 1}: HTTP ${imgResponse.status}`);
          continue;
        }

        const contentType = imgResponse.headers.get('content-type') ?? '';
        const arrayBuffer = await imgResponse.arrayBuffer();

        // Validate the downloaded file is actually an image
        const { valid } = validateFileSignature(arrayBuffer, ALLOWED_IMAGE_TYPES);
        if (!valid) {
          continue; // Silently skip non-image files
        }

        // Skip tiny files (likely tracking pixels)
        if (arrayBuffer.byteLength < 5_000) {
          continue;
        }

        // Determine extension from content type
        let ext = 'png';
        if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
        else if (contentType.includes('webp')) ext = 'webp';

        // Upload to storage
        const storagePath = `${clientId}/${crypto.randomUUID()}.${ext}`;
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadErr } = await admin.storage
          .from('ad-creatives')
          .upload(storagePath, buffer, {
            contentType: contentType || `image/${ext}`,
            upsert: false,
          });

        if (uploadErr) {
          console.error('Scrape upload error:', uploadErr);
          errors.push(`Failed to store image ${i + 1}`);
          continue;
        }

        const { data: publicUrl } = admin.storage
          .from('ad-creatives')
          .getPublicUrl(storagePath);

        const templateName = `Scraped ad ${i + 1}`;

        // Create template record
        const { data: template, error: insertErr } = await admin
          .from('ad_prompt_templates')
          .insert({
            client_id: clientId,
            name: templateName,
            reference_image_url: publicUrl.publicUrl,
            prompt_schema: {},
            aspect_ratio: '1:1',
            ad_category,
            tags: [
              isMetaAdLibraryUrl(url) ? 'ad_library_scrape' : 'scraped',
              new URL(url).hostname,
            ],
            created_by: user.id,
          })
          .select('id')
          .single();

        if (insertErr || !template) {
          console.error('Scrape insert error:', insertErr);
          errors.push(`Failed to save template for image ${i + 1}`);
          continue;
        }

        templates.push({ id: template.id, name: templateName });
        templateIdsForExtraction.push({ id: template.id, imageUrl: publicUrl.publicUrl });
      } catch (imgErr) {
        const message = imgErr instanceof Error ? imgErr.message : 'Unknown error';
        errors.push(`Image ${i + 1}: ${message}`);
      }
    }

    // Run AI extraction in background for all successfully imported images
    if (templateIdsForExtraction.length > 0) {
      after(async () => {
        const concurrency = 3;
        const queue = [...templateIdsForExtraction];

        async function processNext() {
          const item = queue.shift();
          if (!item) return;

          try {
            const promptSchema = await extractAdPrompt(item.imageUrl);
            await admin
              .from('ad_prompt_templates')
              .update({ prompt_schema: promptSchema, updated_at: new Date().toISOString() })
              .eq('id', item.id);
          } catch (extractErr) {
            console.error('Scrape extraction failed for template:', item.id, extractErr);
          }

          await processNext();
        }

        const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () =>
          processNext(),
        );
        await Promise.all(workers);
      });
    }

    if (scrapeJobId) {
      await admin
        .from('ad_library_scrape_jobs')
        .update({
          status: templates.length > 0 ? 'completed' : 'failed',
          total_found: imageUrls.length,
          imported_count: templates.length,
          completed_at: new Date().toISOString(),
          error_message:
            templates.length === 0 ? (errors[0] ?? 'No images imported') : null,
        })
        .eq('id', scrapeJobId);
    }

    return NextResponse.json({
      found: imageUrls.length,
      imported: templates.length,
      templates,
      errors,
      scrapeJobId,
    });
  } catch (error) {
    console.error('POST /api/clients/[id]/ad-creatives/templates/scrape error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
