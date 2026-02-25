import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processVideoItem } from '@/lib/moodboard/process-video';

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

    // Quick metadata fetch for instant thumbnail + title
    let quickTitle = parsed.data.title ?? null;
    let quickThumbnail: string | null = null;
    let detectedPlatform: string | null = null;
    const url = parsed.data.url;

    try {
      if (url.includes('tiktok.com')) {
        detectedPlatform = 'tiktok';
        // Try tikwm first
        try {
          const tikwmRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(4000) });
          if (tikwmRes.ok) {
            const tikwm = await tikwmRes.json();
            if (tikwm.code === 0 && tikwm.data) {
              quickTitle = quickTitle || tikwm.data.title || null;
              quickThumbnail = tikwm.data.cover || tikwm.data.origin_cover || null;
            }
          }
        } catch { /* tikwm failed, try oembed */ }
        // Fallback to TikTok oEmbed
        if (!quickThumbnail) {
          try {
            const oembedRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(4000) });
            if (oembedRes.ok) {
              const oembed = await oembedRes.json();
              quickTitle = quickTitle || oembed.title || null;
              quickThumbnail = oembed.thumbnail_url || null;
            }
          } catch { /* oembed also failed */ }
        }
        // Fallback: scrape og:image from page
        if (!quickThumbnail) {
          try {
            const pageRes = await fetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
              signal: AbortSignal.timeout(5000),
              redirect: 'follow',
            });
            if (pageRes.ok) {
              const html = await pageRes.text();
              const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1];
              const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/)?.[1];
              quickThumbnail = ogImage || null;
              quickTitle = quickTitle || ogTitle || null;
            }
          } catch { /* page scrape failed */ }
        }
      } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        detectedPlatform = 'youtube';
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(5000) });
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          quickTitle = quickTitle || oembed.title || null;
          quickThumbnail = oembed.thumbnail_url || null;
        }
      } else if (url.includes('instagram.com')) {
        detectedPlatform = 'instagram';
      } else if (url.includes('twitter.com') || url.includes('x.com')) {
        detectedPlatform = 'twitter';
      }
    } catch {
      // Quick fetch failed, no problem — full processing will handle it
    }

    const insertData: Record<string, unknown> = {
        board_id: parsed.data.board_id,
        url: parsed.data.url,
        type: parsed.data.type,
        title: quickTitle,
        thumbnail_url: quickThumbnail,
        platform: detectedPlatform,
        position_x: parsed.data.position_x,
        position_y: parsed.data.position_y,
        created_by: user.id,
        status: parsed.data.type === 'image' ? 'completed' : 'pending',
        width: (detectedPlatform === 'tiktok' || detectedPlatform === 'instagram') ? 240 : 320,
      };
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

    // Auto-trigger processing for video and website items (non-blocking)
    if (item && parsed.data.type === 'video') {
      Promise.resolve().then(async () => {
        await processVideoItem(item.id);
      }).catch((err) => console.error('Auto-process video failed:', err));
    } else if (item && parsed.data.type === 'website') {
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
