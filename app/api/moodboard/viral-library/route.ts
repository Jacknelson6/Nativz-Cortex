import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface ViralResult {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  author: string;
  platform: 'tiktok' | 'youtube' | 'instagram';
  views: number;
  likes: number;
  duration: number | null;
}

async function searchTikTok(q: string, limit: number): Promise<ViralResult[]> {
  try {
    const res = await fetch(
      `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(q)}&count=${limit}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (json.code !== 0 || !json.data?.videos) return [];

    return json.data.videos.map((v: any) => ({
      id: `tt-${v.video_id || v.id}`,
      url: `https://www.tiktok.com/@${v.author?.unique_id || 'user'}/video/${v.video_id || v.id}`,
      title: v.title || 'Untitled',
      thumbnail: v.cover || v.origin_cover || '',
      author: v.author?.nickname || v.author?.unique_id || 'Unknown',
      platform: 'tiktok' as const,
      views: v.play_count ?? 0,
      likes: v.digg_count ?? 0,
      duration: v.duration ?? null,
    }));
  } catch {
    return [];
  }
}

async function searchYouTube(q: string, limit: number): Promise<ViralResult[]> {
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=CAMSAhAB`,
      {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
    );
    if (!res.ok) return [];
    const html = await res.text();

    const match = html.match(new RegExp('var ytInitialData = ({.*?});</script>', 's'));
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents?.[0]?.itemSectionRenderer?.contents ?? [];

    const results: ViralResult[] = [];
    for (const item of contents) {
      const v = item.videoRenderer;
      if (!v) continue;
      const viewText = v.viewCountText?.simpleText ?? v.viewCountText?.runs?.[0]?.text ?? '0';
      const viewNum = parseInt(viewText.replace(/[^0-9]/g, ''), 10) || 0;
      results.push({
        id: `yt-${v.videoId}`,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        title: v.title?.runs?.[0]?.text || 'Untitled',
        thumbnail: v.thumbnail?.thumbnails?.pop()?.url || '',
        author: v.ownerText?.runs?.[0]?.text || 'Unknown',
        platform: 'youtube',
        views: viewNum,
        likes: 0,
        duration: null,
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
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

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const platform = searchParams.get('platform') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    if (!q.trim()) {
      return NextResponse.json({ error: 'Search query required' }, { status: 400 });
    }

    const promises: Promise<ViralResult[]>[] = [];
    if (platform === 'all' || platform === 'tiktok') promises.push(searchTikTok(q, limit));
    if (platform === 'all' || platform === 'youtube') promises.push(searchYouTube(q, limit));

    const settled = await Promise.allSettled(promises);
    const results: ViralResult[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(...r.value);
    }

    // Sort by views descending
    results.sort((a, b) => b.views - a.views);

    return NextResponse.json({ results: results.slice(0, limit) });
  } catch (err: any) {
    console.error('Viral library error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
