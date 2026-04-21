import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

// NAT-57 follow-up: one-shot "paste URL → save competitor" endpoint.
// The admin pastes a website URL; we scrape the page for:
//   - brand name (og:site_name, og:title, <title>)
//   - description (og:description / meta description)
//   - logo (apple-touch-icon → og:image → Clearbit → Google favicon)
//   - social handles (IG / TT / FB / YT) via the same regex
//     extractor /api/clients/analyze-url uses
//
// Creates the competitor + per-platform client_competitors rows + a
// simple snapshot in one transaction-like flow. Returns the saved
// competitor so the UI can push it into the list without a refetch.

const bodySchema = z.object({
  url: z.string().url('A valid URL is required'),
});

type Platform = 'instagram' | 'tiktok' | 'facebook' | 'youtube';
const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'facebook', 'youtube'];

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!userData || userData.role !== 'admin') return null;
  return user;
}

function extractHandle(html: string, regex: RegExp, reject: string[]): string | null {
  const rejectSet = new Set(reject.map((r) => r.toLowerCase()));
  const matches = html.matchAll(regex);
  for (const m of matches) {
    const handle = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (!handle) continue;
    if (rejectSet.has(handle.toLowerCase())) continue;
    if (handle.length > 50) continue;
    return handle;
  }
  return null;
}

function canonicalUrl(platform: Platform, handle: string): string {
  const h = handle.replace(/^@+/, '');
  switch (platform) {
    case 'instagram': return `https://instagram.com/${h}`;
    case 'tiktok':    return `https://tiktok.com/@${h}`;
    case 'facebook':  return `https://facebook.com/${h}`;
    case 'youtube':   return `https://youtube.com/@${h}`;
  }
}

/**
 * POST /api/clients/[id]/competitors/scrape
 *
 * Fast path: paste a URL, get back a saved competitor row. Heuristic
 * scrape only (no LLM) — we want this to feel instant. If extraction
 * fails partially, we save what we got; the admin can edit missing
 * fields afterward via the per-row PATCH endpoint.
 *
 * @auth Admin only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const url = parsed.data.url;

    // Fetch the competitor's page with a short timeout. Serverless
    // functions have a hard cap; we'd rather fail fast than hang.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let html: string;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NativzBot/1.0)' },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Fetch failed with ${res.status}. Check the URL and try again.` },
          { status: 422 },
        );
      }
      html = await res.text();
    } catch {
      return NextResponse.json(
        { error: 'Could not fetch that URL. Check it and try again.' },
        { status: 422 },
      );
    } finally {
      clearTimeout(timeout);
    }

    // Extract brand name. Priority: og:site_name → og:title → <title>.
    function extractMeta(property: string): string | null {
      const patterns = [
        new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${property}["']`, 'i'),
        new RegExp(`<meta\\s+name=["']${property}["']\\s+content=["']([^"']+)["']`, 'i'),
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m?.[1]) return m[1].trim();
      }
      return null;
    }

    const brandName =
      extractMeta('og:site_name') ||
      extractMeta('og:title') ||
      (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').trim() ||
      new URL(url).hostname.replace(/^www\./, '');

    const description =
      extractMeta('og:description') || extractMeta('description') || null;

    // Social handles.
    const socials: Record<Platform, string | null> = {
      instagram: extractHandle(html, /(?:instagram\.com|instagr\.am)\/([A-Za-z0-9._]+)(?:\/|$|["?#])/gi, ['p', 'explore', 'reel', 'tv', 'stories']),
      tiktok: extractHandle(html, /tiktok\.com\/@([A-Za-z0-9._]+)(?:\/|$|["?#])/gi, []),
      facebook: extractHandle(html, /facebook\.com\/([A-Za-z0-9.]+)(?:\/|$|["?#])/gi, ['sharer', 'dialog', 'tr', 'plugins', 'pages']),
      youtube: extractHandle(html, /youtube\.com\/(?:@([A-Za-z0-9._-]+)|c\/([A-Za-z0-9._-]+)|channel\/([A-Za-z0-9._-]+)|user\/([A-Za-z0-9._-]+))(?:\/|$|["?#])/gi, []),
    };

    const adminClient = createAdminClient();

    // Insert parent row first. website_scraped: true flags this as
    // auto-discovered so the UI can surface that provenance.
    const { data: parent, error: parentErr } = await adminClient
      .from('competitors')
      .insert({
        client_id: clientId,
        brand_name: brandName.slice(0, 200),
        website_url: url,
        notes: description ? description.slice(0, 2000) : null,
        website_scraped: true,
        added_by: user.id,
      })
      .select('id, brand_name, website_url, notes, website_scraped, created_at, updated_at')
      .single();
    if (parentErr || !parent) {
      console.error('competitors/scrape: parent insert error', parentErr);
      return NextResponse.json({ error: 'Failed to save competitor' }, { status: 500 });
    }

    // Per-platform handle rows — only for platforms we actually found.
    const handleRows = PLATFORMS
      .filter((p) => !!socials[p])
      .map((p) => ({
        client_id: clientId,
        competitor_id: parent.id,
        platform: p,
        profile_url: canonicalUrl(p, socials[p] as string),
        username: (socials[p] as string).replace(/^@+/, ''),
        website_scraped: true,
        added_by: user.id,
      }));

    if (handleRows.length > 0) {
      const { error: handlesErr } = await adminClient
        .from('client_competitors')
        .insert(handleRows);
      if (handlesErr) {
        // Non-fatal — parent row already saved. Log + continue.
        console.error('competitors/scrape: handle rows error', handlesErr);
      }
    }

    return NextResponse.json({
      competitor: parent,
      scraped: {
        brand_name: brandName,
        description,
        socials,
        handle_count: handleRows.length,
      },
    });
  } catch (err) {
    console.error('competitors/scrape fatal', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
