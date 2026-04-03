import type { SupabaseClient } from '@supabase/supabase-js';
import { createCompletion } from '@/lib/ai/client';
import { DEFAULT_OPENROUTER_MODEL } from '@/lib/ai/openrouter-default-model';
import { extractTikTokTranscript, getTikTokMetadata } from '@/lib/tiktok/scraper';
import type { TranscriptSegment } from '@/lib/types/moodboard';
import type { PlatformSource, SearchPlatform } from '@/lib/types/search';
import { patchPlatformSourceInSearch } from '@/lib/search/patch-platform-source';

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

export type TopicSearchTranscribeResult =
  | { ok: true; source: PlatformSource }
  | { ok: false; error: string; status?: number };

/**
 * Transcribe a topic-search platform source (TikTok / YouTube) and persist transcript + segments on the search row.
 */
export async function runTopicSearchSourceTranscribe(
  admin: SupabaseClient,
  searchId: string,
  platform: SearchPlatform,
  sourceId: string,
  source: PlatformSource,
  user: { id: string; email?: string | null },
): Promise<TopicSearchTranscribeResult> {
  let transcript = '';
  let segments: TranscriptSegment[] = [];

  if (source.platform === 'tiktok') {
    const meta = await getTikTokMetadata(source.url);
    const result = await extractTikTokTranscript(source.url, meta?.video_url ?? null);
    transcript = result.text;
    segments = result.segments;
  } else if (source.platform === 'youtube') {
    const videoId = extractYouTubeId(source.url);
    if (videoId) {
      transcript = await fetchYouTubeCaptions(videoId);
    }
  } else {
    return { ok: false, error: 'Transcription is only available for TikTok and YouTube sources.', status: 400 };
  }

  if (!transcript?.trim()) {
    return {
      ok: false,
      error: 'Could not extract transcript. The video may not have captions or audio.',
      status: 422,
    };
  }

  let titlePatch: Partial<PlatformSource> = {};
  const needsTitle =
    !source.title ||
    source.title === 'Untitled video' ||
    source.title === 'TikTok video' ||
    source.title === 'YouTube video';
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
        modelPreference: [DEFAULT_OPENROUTER_MODEL],
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
    if (generatedTitle) {
      titlePatch = { title: generatedTitle };
    }
  }

  const patch: Partial<PlatformSource> = {
    transcript,
    transcript_segments: segments.length > 0 ? segments : undefined,
    ...titlePatch,
  };

  const result = await patchPlatformSourceInSearch(admin, searchId, platform, sourceId, patch);
  if (!result.ok) {
    return result;
  }
  return { ok: true, source: result.updated };
}
