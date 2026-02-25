import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractTikTokTranscript } from '@/lib/tiktok/scraper';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: item, error: fetchError } = await adminClient
      .from('moodboard_items')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.type !== 'video') {
      return NextResponse.json({ error: 'Only video items can be transcribed' }, { status: 400 });
    }

    let transcript = '';
    let segments: Array<{ start: number; end: number; text: string }> = [];

    if (item.platform === 'tiktok') {
      // Get video_url from metadata if stored during creation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const videoUrl = (item as any).metadata?.video_url || null;
      const result = await extractTikTokTranscript(item.url, videoUrl);
      transcript = result.text;
      segments = result.segments;
    } else if (item.platform === 'youtube') {
      // Fetch YouTube captions
      const videoId = extractYouTubeId(item.url);
      if (videoId) {
        transcript = await fetchYouTubeCaptions(videoId);
      }
    }

    if (!transcript) {
      return NextResponse.json({ error: 'Could not extract transcript. The video may not have captions or audio.' }, { status: 422 });
    }

    // Save transcript
    await adminClient
      .from('moodboard_items')
      .update({
        transcript,
        transcript_segments: segments.length > 0 ? segments : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    const { data: updated } = await adminClient
      .from('moodboard_items')
      .select('*')
      .eq('id', id)
      .single();

    return NextResponse.json(updated);
  } catch (error) {
    console.error('POST /api/moodboard/items/[id]/transcribe error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function fetchYouTubeCaptions(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return '';
    const xml = await res.text();
    const textMatches = xml.match(/<text[^>]*>([^<]*)<\/text>/g);
    if (!textMatches) return '';
    return textMatches
      .map((m) => {
        const content = m.replace(/<[^>]*>/g, '');
        return content.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      })
      .join(' ')
      .trim();
  } catch { return ''; }
}
