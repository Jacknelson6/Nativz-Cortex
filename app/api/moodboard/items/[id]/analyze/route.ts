import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { VideoAnalysis } from '@/lib/types/moodboard';

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
      return NextResponse.json({ error: 'Only video items can be analyzed' }, { status: 400 });
    }

    // Build context from available metadata
    let platformContext = '';
    if (item.stats) {
      platformContext = `\nStats: ${item.stats.views?.toLocaleString()} views, ${item.stats.likes?.toLocaleString()} likes, ${item.stats.comments?.toLocaleString()} comments, ${item.stats.shares?.toLocaleString()} shares`;
    }
    if (item.music) platformContext += `\nMusic/Sound: ${item.music}`;
    if (item.hashtags?.length > 0) platformContext += `\nHashtags: ${item.hashtags.join(', ')}`;
    if (item.duration) platformContext += `\nDuration: ${item.duration}s`;

    const analysisPrompt = `You are a video content strategist analyzing a video for a marketing agency.

${item.transcript ? `Transcript: ${item.transcript}` : 'No transcript available — analyze based on available metadata only.'}
Video URL: ${item.url}
Platform: ${item.platform || 'unknown'}
Title: ${item.title || 'Unknown'}
Author: ${item.author_name || 'Unknown'}${platformContext}

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

    // Update item with analysis data
    await adminClient
      .from('moodboard_items')
      .update({
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
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Fetch updated item
    const { data: updated } = await adminClient
      .from('moodboard_items')
      .select('*')
      .eq('id', id)
      .single();

    return NextResponse.json(updated);
  } catch (error) {
    console.error('POST /api/moodboard/items/[id]/analyze error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
