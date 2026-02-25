import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as cheerio from 'cheerio';

const createItemSchema = z.object({
  board_id: z.string().uuid('Invalid board ID'),
  url: z.string().url('Invalid URL'),
  type: z.enum(['video', 'image', 'website']),
  title: z.string().max(500).optional().nullable(),
  position_x: z.number().optional().default(0),
  position_y: z.number().optional().default(0),
  width: z.number().optional(),
  height: z.number().optional(),
});

interface QuickMetadata {
  title: string | null;
  thumbnail_url: string | null;
  author_name: string | null;
  author_handle: string | null;
  stats: { views: number; likes: number; comments: number; shares: number } | null;
  music: string | null;
  duration: number | null;
  hashtags: string[];
  video_url: string | null;
}

async function fetchTikTokMetadata(url: string): Promise<QuickMetadata> {
  const result: QuickMetadata = {
    title: null, thumbnail_url: null, author_name: null, author_handle: null,
    stats: null, music: null, duration: null, hashtags: [], video_url: null,
  };

  // Try tikwm (4s timeout)
  try {
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.code === 0 && json.data) {
        const d = json.data;
        result.title = d.title || null;
        result.thumbnail_url = d.cover || d.origin_cover || null;
        result.author_name = d.author?.nickname || null;
        result.author_handle = d.author?.unique_id || null;
        result.duration = d.duration || null;
        result.music = d.music_info?.title ?? d.music ?? null;
        result.video_url = d.play || null;
        const s = d.statistics ?? {};
        result.stats = {
          views: s.playCount ?? d.play_count ?? 0,
          likes: s.diggCount ?? d.digg_count ?? 0,
          comments: s.commentCount ?? d.comment_count ?? 0,
          shares: s.shareCount ?? d.share_count ?? 0,
        };
        const hashtagMatches = (d.title || '').match(/#\w+/g);
        result.hashtags = hashtagMatches ? hashtagMatches.map((h: string) => h.replace('#', '')) : [];
        if (result.thumbnail_url) return result;
      }
    }
  } catch { /* tikwm failed */ }

  // Try oEmbed (4s timeout)
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      result.title = result.title || data.title || null;
      result.thumbnail_url = result.thumbnail_url || data.thumbnail_url || null;
      result.author_name = result.author_name || data.author_name || null;
      result.author_handle = result.author_handle || data.author_unique_id || null;
      if (result.thumbnail_url) return result;
    }
  } catch { /* oembed failed */ }

  // Try HTML scrape with __UNIVERSAL_DATA_FOR_REHYDRATION__ (5s timeout)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      // Try __UNIVERSAL_DATA_FOR_REHYDRATION__ first (richest data)
      let universalData: Record<string, unknown> | null = null;
      $('script#__UNIVERSAL_DATA_FOR_REHYDRATION__').each((_i, el) => {
        try { universalData = JSON.parse($(el).html() || ''); } catch { /* ignore */ }
      });

      if (universalData) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const scope = (universalData as any)?.['__DEFAULT_SCOPE__'];
          const videoDetail = scope?.['webapp.video-detail']?.['itemInfo']?.['itemStruct'];
          if (videoDetail) {
            result.author_name = result.author_name || videoDetail.author?.nickname || null;
            result.author_handle = result.author_handle || videoDetail.author?.uniqueId || null;
            result.duration = result.duration || videoDetail.video?.duration || null;
            result.title = result.title || videoDetail.desc || null;
            result.thumbnail_url = result.thumbnail_url || videoDetail.video?.cover || videoDetail.video?.originCover || null;
            const s = videoDetail.stats;
            if (s && !result.stats) {
              result.stats = {
                views: s.playCount || 0,
                likes: s.diggCount || 0,
                comments: s.commentCount || 0,
                shares: s.shareCount || 0,
              };
            }
            if (videoDetail.music?.title) {
              result.music = result.music || videoDetail.music.title;
            }
            // Extract hashtags from textExtra if available
            if (!result.hashtags.length && videoDetail.textExtra) {
              result.hashtags = videoDetail.textExtra
                .filter((t: { hashtagName?: string }) => t.hashtagName)
                .map((t: { hashtagName: string }) => t.hashtagName);
            }
          }
        } catch { /* structure may change */ }
      }

      // Fallback to og: tags
      if (!result.thumbnail_url) {
        result.thumbnail_url = $('meta[property="og:image"]').attr('content') || null;
      }
      if (!result.title) {
        const ogDesc = $('meta[property="og:description"]').attr('content');
        const ogTitle = $('meta[property="og:title"]').attr('content');
        result.title = ogDesc || ogTitle || null;
      }
    }
  } catch { /* scrape failed */ }

  return result;
}

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
    const parsed = createItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify board exists
    const { data: board } = await adminClient
      .from('moodboard_boards')
      .select('id')
      .eq('id', parsed.data.board_id)
      .single();

    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Quick metadata fetch for instant card rendering
    let quickTitle = parsed.data.title ?? null;
    let quickThumbnail: string | null = null;
    let detectedPlatform: string | null = null;
    let authorName: string | null = null;
    let authorHandle: string | null = null;
    let stats: { views: number; likes: number; comments: number; shares: number } | null = null;
    let music: string | null = null;
    let duration: number | null = null;
    let hashtags: string[] = [];
    let videoUrl: string | null = null;
    const url = parsed.data.url;

    try {
      if (url.includes('tiktok.com')) {
        detectedPlatform = 'tiktok';
        const meta = await fetchTikTokMetadata(url);
        quickTitle = quickTitle || meta.title;
        quickThumbnail = meta.thumbnail_url;
        authorName = meta.author_name;
        authorHandle = meta.author_handle;
        stats = meta.stats;
        music = meta.music;
        duration = meta.duration;
        hashtags = meta.hashtags;
        videoUrl = meta.video_url;
      } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        detectedPlatform = 'youtube';
        try {
          const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(5000) });
          if (oembedRes.ok) {
            const oembed = await oembedRes.json();
            quickTitle = quickTitle || oembed.title || null;
            quickThumbnail = oembed.thumbnail_url || null;
            authorName = oembed.author_name || null;
          }
        } catch { /* youtube oembed failed */ }
      } else if (url.includes('instagram.com/reel') || url.includes('instagram.com/p/')) {
        detectedPlatform = 'instagram';
        // Try Instagram oEmbed
        try {
          const oembedRes = await fetch(`https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
          if (oembedRes.ok) {
            const oembed = await oembedRes.json();
            quickTitle = quickTitle || oembed.title || null;
            quickThumbnail = oembed.thumbnail_url || null;
            authorName = oembed.author_name || null;
          }
        } catch { /* instagram oembed failed */ }

        // Fallback: HTML scrape for og tags
        if (!quickThumbnail) {
          try {
            const res = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
              },
              redirect: 'follow',
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              const html = await res.text();
              const $ = cheerio.load(html);
              quickThumbnail = quickThumbnail || $('meta[property="og:image"]').attr('content') || null;
              quickTitle = quickTitle || $('meta[property="og:description"]').attr('content') || $('meta[property="og:title"]').attr('content') || null;
            }
          } catch { /* scrape failed */ }
        }
      } else if (url.includes('facebook.com/reel') || url.includes('fb.watch') || url.includes('facebook.com/watch') || url.includes('facebook.com/share/v/')) {
        detectedPlatform = 'facebook';
        // Try Facebook video oEmbed
        try {
          const oembedRes = await fetch(`https://www.facebook.com/plugins/video/oembed.json?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
          if (oembedRes.ok) {
            const oembed = await oembedRes.json();
            quickTitle = quickTitle || oembed.title || null;
            quickThumbnail = oembed.thumbnail_url || null;
            authorName = oembed.author_name || null;
          }
        } catch { /* facebook oembed failed */ }

        // Fallback: HTML scrape for og tags
        if (!quickThumbnail) {
          try {
            const res = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
              },
              redirect: 'follow',
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              const html = await res.text();
              const $ = cheerio.load(html);
              quickThumbnail = quickThumbnail || $('meta[property="og:image"]').attr('content') || null;
              quickTitle = quickTitle || $('meta[property="og:description"]').attr('content') || $('meta[property="og:title"]').attr('content') || null;
            }
          } catch { /* scrape failed */ }
        }
      } else if (url.includes('twitter.com') || url.includes('x.com')) {
        detectedPlatform = 'twitter';
      }
    } catch {
      // Metadata fetch failed — still create the item
    }

    // Always create the item, even if metadata fetch failed entirely
    const insertData: Record<string, unknown> = {
      board_id: parsed.data.board_id,
      url: parsed.data.url,
      type: parsed.data.type,
      title: quickTitle || 'Untitled video',
      thumbnail_url: quickThumbnail,
      platform: detectedPlatform,
      author_name: authorName,
      author_handle: authorHandle,
      stats,
      music,
      duration,
      hashtags,
      position_x: parsed.data.position_x,
      position_y: parsed.data.position_y,
      created_by: user.id,
      // Metadata IS the completed state — no auto AI processing
      status: 'completed',
      width: (detectedPlatform === 'tiktok' || detectedPlatform === 'instagram' || detectedPlatform === 'facebook') ? 240 : 320,
    };
    // Store video_url in a metadata field if we got one (useful for later transcription)
    if (videoUrl) {
      insertData.metadata = { video_url: videoUrl };
    }
    if (parsed.data.width !== undefined) insertData.width = parsed.data.width;
    if (parsed.data.height !== undefined) insertData.height = parsed.data.height;

    const { data: item, error: insertError } = await adminClient
      .from('moodboard_items')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating item:', insertError);
      return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
    }

    // Update board's updated_at timestamp
    await adminClient
      .from('moodboard_boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', parsed.data.board_id);

    // Auto-trigger processing for website items only (non-blocking)
    if (item && parsed.data.type === 'website') {
      const processUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/moodboard/items/${item.id}/insights`;
      fetch(processUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': request.headers.get('cookie') || '',
        },
      }).catch((err) => console.error('Auto-process trigger failed:', err));
    }

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('POST /api/moodboard/items error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
// on-demand refactor
