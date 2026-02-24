import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { VideoAnalysis } from '@/lib/types/moodboard';
import { getTikTokMetadata, extractTikTokTranscript, extractKeyFrameReferences } from '@/lib/tiktok/scraper';

// Detect platform from URL
function detectPlatform(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
  return null;
}

// YouTube oEmbed for metadata
async function getYouTubeMetadata(url: string) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title as string,
      thumbnail_url: data.thumbnail_url as string,
      author_name: data.author_name as string,
      author_handle: null as string | null,
    };
  } catch {
    return null;
  }
}

// Instagram oEmbed
async function getInstagramMetadata(url: string) {
  try {
    const res = await fetch(`https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || data.author_name,
        thumbnail_url: data.thumbnail_url,
        author_name: data.author_name,
        author_handle: null as string | null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Twitter/X oEmbed
async function getTwitterMetadata(url: string) {
  try {
    const res = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.html || '').replace(/<[^>]*>/g, '').substring(0, 120);
    return {
      title: text || 'Twitter Video',
      thumbnail_url: '' as string,
      author_name: data.author_name || 'Unknown',
      author_handle: data.author_url ? data.author_url.split('/').pop() || null : null,
    };
  } catch {
    return null;
  }
}

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

    // Get the item
    const { data: item, error: fetchError } = await adminClient
      .from('moodboard_items')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.type !== 'video') {
      return NextResponse.json({ error: 'Only video items can be processed' }, { status: 400 });
    }

    // Detect platform
    const platform = detectPlatform(item.url);

    // Set processing status
    await adminClient
      .from('moodboard_items')
      .update({ status: 'processing', platform, error_message: null })
      .eq('id', id);

    try {
      // Step 1: Get metadata
      let metadata: { title: string; thumbnail_url: string; author_name: string; author_handle: string | null } | null = null;
      let tiktokData: Awaited<ReturnType<typeof getTikTokMetadata>> = null;
      let stats: { views: number; likes: number; comments: number; shares: number } | null = null;
      let music: string | null = null;
      let hashtags: string[] = [];
      let authorHandle: string | null = null;

      if (platform === 'youtube') {
        metadata = await getYouTubeMetadata(item.url);
      } else if (platform === 'tiktok') {
        tiktokData = await getTikTokMetadata(item.url);
        if (tiktokData) {
          metadata = {
            title: tiktokData.title,
            thumbnail_url: tiktokData.thumbnail_url,
            author_name: tiktokData.author_name || tiktokData.author_handle,
            author_handle: tiktokData.author_handle || null,
          };
          authorHandle = tiktokData.author_handle || null;
          if (tiktokData.stats) {
            stats = {
              views: tiktokData.stats.plays || 0,
              likes: tiktokData.stats.likes || 0,
              comments: tiktokData.stats.comments || 0,
              shares: tiktokData.stats.shares || 0,
            };
          }
          music = tiktokData.music || null;
          // Extract hashtags from title if available
          const hashtagMatches = (tiktokData.title || '').match(/#\w+/g);
          hashtags = hashtagMatches ? hashtagMatches.map(h => h.replace('#', '')) : [];
        }
      } else if (platform === 'instagram') {
        metadata = await getInstagramMetadata(item.url);
      } else if (platform === 'twitter') {
        metadata = await getTwitterMetadata(item.url);
      }

      // Update with metadata immediately
      if (metadata) {
        const metadataUpdate: Record<string, unknown> = {
          title: metadata.title || item.title,
          thumbnail_url: metadata.thumbnail_url || item.thumbnail_url,
          author_name: metadata.author_name || null,
          author_handle: metadata.author_handle || authorHandle || null,
          stats: stats,
          music: music,
          hashtags: hashtags,
        };
        if (tiktokData?.duration) {
          metadataUpdate.duration = tiktokData.duration;
        }
        await adminClient
          .from('moodboard_items')
          .update(metadataUpdate)
          .eq('id', id);
      }

      // Step 2: Get transcript
      let transcript = '';
      let frames: Awaited<ReturnType<typeof extractKeyFrameReferences>> = [];

      if (platform === 'youtube') {
        const videoId = extractYouTubeId(item.url);
        if (videoId) {
          transcript = await fetchYouTubeCaptions(videoId);
        }
      } else if (platform === 'tiktok') {
        const tiktokTranscript = await extractTikTokTranscript(item.url, tiktokData?.video_url);
        transcript = tiktokTranscript.text;
        if (tiktokData) {
          frames = await extractKeyFrameReferences(
            tiktokData.video_url || '',
            tiktokData.duration,
            tiktokData.thumbnail_url,
          );
        }
      }

      // Step 3: AI Analysis with hook_score and hook_type
      let platformContext = '';
      if (stats) {
        platformContext = `\nStats: ${stats.views.toLocaleString()} views, ${stats.likes.toLocaleString()} likes, ${stats.comments.toLocaleString()} comments, ${stats.shares.toLocaleString()} shares`;
      }
      if (music) platformContext += `\nMusic/Sound: ${music}`;
      if (hashtags.length > 0) platformContext += `\nHashtags: ${hashtags.join(', ')}`;
      if (tiktokData?.duration || item.duration) platformContext += `\nDuration: ${tiktokData?.duration || item.duration}s`;

      const analysisPrompt = `You are a video content strategist analyzing a video for a marketing agency.

${transcript ? `Transcript: ${transcript}` : 'No transcript available — analyze based on available metadata only.'}
Video URL: ${item.url}
Platform: ${platform || 'unknown'}
Title: ${metadata?.title || item.title || 'Unknown'}
Author: ${metadata?.author_name || 'Unknown'}${platformContext}

Analyze this video and return a JSON object with:
{
  "hook": "The first 1-3 sentences that serve as the hook",
  "hook_analysis": "Why this hook works or doesn't (2-3 sentences)",
  "hook_score": <1-10 integer rating of hook effectiveness>,
  "hook_type": "<one of: question, shocking_stat, controversy, visual_pattern_interrupt, relatable_moment, promise, curiosity_gap, other>",
  "cta": "Identified call-to-action, or 'Not identified' if unclear",
  "concept_summary": "2-3 sentence summary of what this video is about",
  "pacing": {
    "description": "Estimated pacing style based on platform norms and content type",
    "estimated_cuts": 0,
    "cuts_per_minute": 0
  },
  "caption_overlays": [],
  "content_themes": ["3-5 thematic tags"],
  "winning_elements": ["list of what likely works well"],
  "improvement_areas": ["list of potential improvements"]
}

Return ONLY the JSON, no other text.`;

      const aiResponse = await createCompletion({
        messages: [
          { role: 'system', content: 'You are a video content strategist. Return only valid JSON.' },
          { role: 'user', content: analysisPrompt },
        ],
        maxTokens: 2000,
      });

      const analysis = parseAIResponseJSON<VideoAnalysis>(aiResponse.text);

      // Step 4: Update item with all data
      const { data: updated, error: updateError } = await adminClient
        .from('moodboard_items')
        .update({
          status: 'completed',
          title: metadata?.title || item.title || analysis.concept_summary?.substring(0, 60),
          thumbnail_url: metadata?.thumbnail_url || item.thumbnail_url,
          transcript: transcript || null,
          duration: tiktokData?.duration || item.duration || null,
          frames: frames.length > 0 ? frames : item.frames || [],
          hook: analysis.hook ?? null,
          hook_analysis: analysis.hook_analysis ?? null,
          hook_score: typeof analysis.hook_score === 'number' ? analysis.hook_score : null,
          hook_type: analysis.hook_type ?? null,
          cta: analysis.cta ?? null,
          concept_summary: analysis.concept_summary ?? null,
          pacing: analysis.pacing ?? null,
          caption_overlays: analysis.caption_overlays ?? [],
          content_themes: analysis.content_themes ?? [],
          winning_elements: analysis.winning_elements ?? [],
          improvement_areas: analysis.improvement_areas ?? [],
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update board timestamp
      await adminClient
        .from('moodboard_boards')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', item.board_id);

      return NextResponse.json(updated);
    } catch (processingError) {
      const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown error';
      // Mark as failed with error message
      await adminClient
        .from('moodboard_items')
        .update({ status: 'failed', error_message: errorMessage })
        .eq('id', id);

      console.error('Video processing error:', processingError);
      return NextResponse.json(
        { error: 'Video processing failed', details: errorMessage },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('POST /api/moodboard/items/[id]/process error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
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
  } catch {
    return '';
  }
}
