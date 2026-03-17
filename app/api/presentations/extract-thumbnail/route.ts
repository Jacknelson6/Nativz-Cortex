import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  url: z.string().url('Valid URL required'),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { url } = parsed.data;

    const oembedResult = await tryOembed(url);
    if (oembedResult) {
      return NextResponse.json(oembedResult);
    }

    const ogResult = await extractOpenGraph(url);
    return NextResponse.json(ogResult);
  } catch (error) {
    console.error('POST /api/presentations/extract-thumbnail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function tryOembed(url: string): Promise<{ thumbnail_url: string | null; title: string } | null> {
  const oembedEndpoints: { pattern: RegExp; endpoint: string }[] = [
    {
      pattern: /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/,
      endpoint: `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    },
    {
      pattern: /vimeo\.com\//,
      endpoint: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
    },
    {
      pattern: /tiktok\.com\//,
      endpoint: `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    },
    {
      pattern: /instagram\.com\/(p|reel|reels)\//,
      endpoint: `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${process.env.META_ACCESS_TOKEN || ''}`,
    },
  ];

  for (const { pattern, endpoint } of oembedEndpoints) {
    if (pattern.test(url)) {
      try {
        const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          return {
            thumbnail_url: data.thumbnail_url ?? null,
            title: data.title ?? '',
          };
        }
      } catch {
        // Fall through to OpenGraph
      }
      break;
    }
  }

  return null;
}

async function extractOpenGraph(url: string): Promise<{ thumbnail_url: string | null; title: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NativzCortex/1.0)',
      },
    });

    if (!res.ok) {
      return { thumbnail_url: null, title: '' };
    }

    const html = await res.text();

    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    return {
      thumbnail_url: ogImageMatch?.[1] ?? null,
      title: ogTitleMatch?.[1] ?? titleMatch?.[1]?.trim() ?? '',
    };
  } catch {
    return { thumbnail_url: null, title: '' };
  }
}
