import type { SupabaseClient } from '@supabase/supabase-js';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { VideoAnalysis } from '@/lib/types/moodboard';

export type AnalyzeResult =
  | { ok: true; item: Record<string, unknown> }
  | { ok: false; error: string; status?: number };

/**
 * LLM hook / strategy analysis for a moodboard video (no MediaPipe merge).
 */
export async function runMoodboardAnalyzeLlm(
  adminClient: SupabaseClient,
  itemId: string,
  user: { id: string; email?: string | null },
): Promise<AnalyzeResult> {
  const { data: item, error: fetchError } = await adminClient.from('moodboard_items').select('*').eq('id', itemId).single();

  if (fetchError || !item) {
    return { ok: false, error: 'Item not found', status: 404 };
  }

  if (item.type !== 'video') {
    return { ok: false, error: 'Only video items can be analyzed', status: 400 };
  }

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
  "hook_analysis": "Why this hook works or doesn't (1 sentence, max 20 words)",
  "hook_score": <1-10 integer rating of hook effectiveness>,
  "hook_type": "<one of: question, shocking_stat, controversy, visual_pattern_interrupt, relatable_moment, promise, curiosity_gap, other>",
  "cta": "Identified call-to-action, or 'Not identified' if unclear",
  "concept_summary": "1 sentence summary of what this video is about (max 20 words)",
  "pacing": {
    "description": "Estimated pacing style based on platform norms and content type",
    "estimated_cuts": 0,
    "cuts_per_minute": 0
  },
  "caption_overlays": [],
  "content_themes": ["First tag MUST be the content category: one of 'trend jacking', 'education', 'product launch', 'testimonial', 'behind the scenes', 'storytelling', 'entertainment', 'how-to', 'comparison', 'challenge', 'news reaction', 'lifestyle', 'promotion'. Then 2-4 additional thematic tags."],
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
    feature: 'analysis_item_analysis',
    userId: user.id,
    userEmail: user.email ?? undefined,
  });

  const analysis = parseAIResponseJSON<VideoAnalysis>(aiResponse.text);

  const hookScore = typeof analysis.hook_score === 'number' ? analysis.hook_score : null;

  const updatePayload: Record<string, unknown> = {
    hook: analysis.hook ?? null,
    hook_analysis: analysis.hook_analysis ?? null,
    hook_score: hookScore,
    hook_type: analysis.hook_type ?? null,
    cta: analysis.cta ?? null,
    concept_summary: analysis.concept_summary ?? null,
    pacing: analysis.pacing ?? null,
    caption_overlays: analysis.caption_overlays ?? [],
    content_themes: analysis.content_themes ?? [],
    winning_elements: analysis.winning_elements ?? [],
    improvement_areas: analysis.improvement_areas ?? [],
    updated_at: new Date().toISOString(),
  };

  await adminClient.from('moodboard_items').update(updatePayload).eq('id', itemId);

  const { data: updated } = await adminClient.from('moodboard_items').select('*').eq('id', itemId).single();

  if (!updated) {
    return { ok: false, error: 'Failed to load updated item' };
  }

  return { ok: true, item: updated as Record<string, unknown> };
}
