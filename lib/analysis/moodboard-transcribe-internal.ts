import type { SupabaseClient } from '@supabase/supabase-js';
import { extractTikTokTranscript } from '@/lib/tiktok/scraper';
import { extractInstagramTranscript } from '@/lib/instagram/scraper';
import { createCompletion } from '@/lib/ai/client';

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
    const res = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return '';
    const xml = await res.text();
    const textMatches = xml.match(/<text[^>]*>([^<]*)<\/text>/g);
    if (!textMatches) return '';
    return textMatches
      .map((m) => {
        const content = m.replace(/<[^>]*>/g, '');
        return content
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"');
      })
      .join(' ')
      .trim();
  } catch {
    return '';
  }
}

export type TranscribeResult =
  | { ok: true; item: Record<string, unknown> }
  | { ok: false; error: string; status?: number };

/**
 * Server-side transcription for moodboard video items (shared with API route and Nerd tools).
 */
export async function runMoodboardTranscribe(
  adminClient: SupabaseClient,
  itemId: string,
  user: { id: string; email?: string | null },
): Promise<TranscribeResult> {
  const { data: item, error: fetchError } = await adminClient.from('moodboard_items').select('*').eq('id', itemId).single();

  if (fetchError || !item) {
    return { ok: false, error: 'Item not found', status: 404 };
  }

  if (item.type !== 'video') {
    return { ok: false, error: 'Only video items can be transcribed', status: 400 };
  }

  let transcript = '';
  let segments: Array<{ start: number; end: number; text: string }> = [];

  if (item.platform === 'tiktok') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoUrl = (item as any).metadata?.video_url || null;
    const result = await extractTikTokTranscript(item.url as string, videoUrl);
    transcript = result.text;
    segments = result.segments;
  } else if (item.platform === 'instagram') {
    const result = await extractInstagramTranscript(item.url as string);
    transcript = result.text;
    segments = result.segments;
  } else if (item.platform === 'youtube') {
    const videoId = extractYouTubeId(item.url as string);
    if (videoId) {
      transcript = await fetchYouTubeCaptions(videoId);
    }
  }

  if (!transcript) {
    return {
      ok: false,
      error: 'Could not extract transcript. The video may not have captions or audio.',
      status: 422,
    };
  }

  const needsTitle =
    !item.title ||
    item.title === 'Untitled video' ||
    item.title === 'TikTok video' ||
    item.title === 'Instagram video' ||
    item.title === 'Instagram reel';
  let generatedTitle: string | null = null;
  if (needsTitle && transcript) {
    try {
      const aiResult = await createCompletion({
        messages: [
          {
            role: 'user',
            content: `Generate a short, catchy title (max 60 characters) for a video based on this transcript. Return ONLY the title text, nothing else.\n\nTranscript:\n${transcript.slice(0, 500)}`,
          },
        ],
        maxTokens: 50,
        feature: 'analysis_transcript_title',
        userId: user.id,
        userEmail: user.email ?? undefined,
      });
      const title = aiResult.text.trim().replace(/^["']|["']$/g, '');
      if (title && title.length <= 80) {
        generatedTitle = title;
      }
    } catch {
      const words = transcript.replace(/\s+/g, ' ').trim().split(' ');
      generatedTitle = words.slice(0, 8).join(' ') + (words.length > 8 ? '...' : '');
    }
  }

  const updateData: Record<string, unknown> = {
    transcript,
    transcript_segments: segments.length > 0 ? segments : null,
    updated_at: new Date().toISOString(),
  };
  if (generatedTitle) {
    updateData.title = generatedTitle;
  }

  await adminClient.from('moodboard_items').update(updateData).eq('id', itemId);

  const { data: updated } = await adminClient.from('moodboard_items').select('*').eq('id', itemId).single();

  if (!updated) {
    return { ok: false, error: 'Failed to load updated item' };
  }

  return { ok: true, item: updated as Record<string, unknown> };
}
