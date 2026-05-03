import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/thumb?url=<encoded-cdn-url>
 *
 * Server-side image proxy for social-post thumbnails. The TikTok / Instagram /
 * Facebook CDNs reject browser hotlinks via Referer sniffing, so the raw URLs
 * baked into `post_metrics.thumbnail_url` 403 when an `<img src>` in our app
 * tries to load them. Routing through this handler does two things:
 *
 *  1. Strips the Referer (Node's `fetch` sends none by default), so the
 *     upstream CDN treats us like any anonymous client.
 *  2. Sets long-lived `Cache-Control` headers so Vercel's edge CDN absorbs
 *     repeat requests for the same thumbnail at zero origin cost.
 *
 * Hosts are restricted to a known list of social CDNs to keep this from
 * doubling as an SSRF vector. Anything off-list returns 400.
 *
 * Future: cache bytes to Supabase Storage during the reporting sync so the
 * proxy doesn't have to re-fetch a signed URL that may expire in 24-72h.
 *
 * @auth Required (any authenticated user)
 * @query url - Absolute https:// URL to proxy (required, allow-listed host)
 * @returns Image bytes with the upstream Content-Type, or 400/403/502.
 */

const ALLOWED_HOST_SUFFIXES = [
  // Instagram + Facebook CDNs
  '.cdninstagram.com',
  '.fbcdn.net',
  // TikTok CDNs (multiple regions/CDNs in rotation)
  '.tiktokcdn.com',
  '.tiktokcdn-us.com',
  '.tiktokcdn-eu.com',
  '.tiktokv.com',
  '.muscdn.com',
  '.byteoversea.com',
  // YouTube
  '.ytimg.com',
  '.googleusercontent.com',
  // LinkedIn
  '.licdn.com',
  // Generic media we already trust (Supabase storage, Mux)
  '.supabase.co',
  '.mux.com',
  '.muxcdn.com',
];

function isAllowedHost(hostname: string): boolean {
  // Suffix match catches subdomains like `scontent-iad3-1.cdninstagram.com`
  // and signed regional hosts like `p16-sign-va.tiktokcdn-us.com`.
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
  );
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get('url');
  if (!raw) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  if (target.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only https URLs are proxied' }, { status: 400 });
  }

  if (!isAllowedHost(target.hostname)) {
    return NextResponse.json(
      { error: `Host not on allow-list: ${target.hostname}` },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      // Node fetch sends no Referer by default — exactly what we want for
      // hotlink-protected CDNs. Use a benign UA so a few CDNs (Instagram in
      // particular) don't 403 on the empty default.
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; NativzCortexThumbnailProxy/1.0; +https://cortex.nativz.io)',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5',
      },
      // Don't redirect into off-list hosts.
      redirect: 'follow',
    });
  } catch (err) {
    console.error('GET /api/thumb fetch error:', err, 'url=', raw);
    return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    // Pass the upstream status through so the client's onError fallback in
    // PostCard runs and we render the platform-glyph placeholder.
    return NextResponse.json(
      { error: `Upstream responded ${upstream.status}` },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';

  // Cache aggressively at the edge. These thumbnails change rarely if at all
  // for the lifetime of a published post, and Vercel's edge cache is keyed on
  // the full URL so different signed URLs naturally bust the entry.
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
    'X-Proxy-Source': target.hostname,
  });
  const upstreamLength = upstream.headers.get('content-length');
  if (upstreamLength) headers.set('Content-Length', upstreamLength);

  return new Response(upstream.body, { status: 200, headers });
}
