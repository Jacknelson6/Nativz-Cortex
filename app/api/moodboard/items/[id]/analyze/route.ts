import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { VideoAnalysis } from '@/lib/types/moodboard';
import { z } from 'zod';

export const maxDuration = 60;

const mediapipeSchema = z.object({
  pacing: z.object({
    totalCuts: z.number(),
    cutsPerMinute: z.number(),
    averageShotDurationMs: z.number(),
    pacingStyle: z.enum(['slow', 'moderate', 'fast', 'rapid']),
    pacingVariance: z.number(),
    shotDurations: z.array(z.number()),
    cutTimestamps: z.array(z.number()),
  }),
  hook: z.object({
    visualHookType: z.enum([
      'face_close_up', 'action_start', 'object_reveal',
      'text_overlay', 'pattern_interrupt', 'slow_build', 'unknown',
    ]),
    faceAppearanceMs: z.number().nullable(),
    faceProminence: z.number(),
    movementEnergy: z.number(),
    objectsDetected: z.array(z.string()),
    visualComplexity: z.number(),
    attentionGrabScore: z.number(),
  }),
  contentClassification: z.object({
    segments: z.array(z.object({
      type: z.enum(['talking_head', 'broll', 'product_shot', 'text_screen', 'transition']),
      startMs: z.number(),
      endMs: z.number(),
      confidence: z.number(),
    })),
    ratios: z.object({
      talkingHead: z.number(),
      broll: z.number(),
      productShot: z.number(),
      textScreen: z.number(),
      transition: z.number(),
    }),
    dominantFormat: z.string(),
    visualVarietyScore: z.number(),
    brollQualityScore: z.number(),
    uniqueSceneCount: z.number(),
  }),
}).optional();

/**
 * POST /api/moodboard/items/[id]/analyze
 *
 * AI analysis of a moodboard video item. Uses Claude to analyze the transcript, platform
 * stats, and context to produce hook scoring, pacing analysis, content themes, winning
 * elements, and improvement areas. Optionally accepts MediaPipe client-side analysis
 * results to merge with the LLM output for more accurate pacing and hook scores.
 *
 * @auth Required (any authenticated user)
 * @param id - Moodboard item UUID (must be type 'video')
 * @body mediapipeResults - Optional MediaPipe analysis from client (pacing, hook, contentClassification)
 * @returns {MoodboardItem} Updated item record with VideoAnalysis fields populated
 */
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

    // Parse optional MediaPipe results from request body
    let mediapipeResults: z.infer<typeof mediapipeSchema> | undefined;
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        const parsed = mediapipeSchema.safeParse(body?.mediapipeResults);
        if (parsed.success) {
          mediapipeResults = parsed.data;
        }
      } catch {
        // Ignore parse errors — proceed without MediaPipe data
      }
    }

    // If only MediaPipe results (no LLM analysis needed), merge and return
    if (mediapipeResults && item.hook_score !== null) {
      const mergeUpdate = buildMediaPipeMerge(mediapipeResults, item);
      await adminClient
        .from('moodboard_items')
        .update({ ...mergeUpdate, updated_at: new Date().toISOString() })
        .eq('id', id);

      const { data: updated } = await adminClient
        .from('moodboard_items')
        .select('*')
        .eq('id', id)
        .single();

      return NextResponse.json(updated);
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
    });

    const analysis = parseAIResponseJSON<VideoAnalysis>(aiResponse.text);

    // Merge MediaPipe pacing data with LLM analysis if available
    let pacing = analysis.pacing ?? null;
    let hookScore = typeof analysis.hook_score === 'number' ? analysis.hook_score : null;

    if (mediapipeResults) {
      // Replace placeholder pacing with real data
      if (pacing) {
        pacing = {
          ...pacing,
          estimated_cuts: mediapipeResults.pacing.totalCuts,
          cuts_per_minute: mediapipeResults.pacing.cutsPerMinute,
        };
      }
      // Combined hook score: 60% text + 40% visual
      if (hookScore !== null) {
        hookScore = Math.round(
          0.6 * hookScore + 0.4 * mediapipeResults.hook.attentionGrabScore
        );
        hookScore = Math.max(1, Math.min(10, hookScore));
      }
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      hook: analysis.hook ?? null,
      hook_analysis: analysis.hook_analysis ?? null,
      hook_score: hookScore,
      hook_type: analysis.hook_type ?? null,
      cta: analysis.cta ?? null,
      concept_summary: analysis.concept_summary ?? null,
      pacing,
      caption_overlays: analysis.caption_overlays ?? [],
      content_themes: analysis.content_themes ?? [],
      winning_elements: analysis.winning_elements ?? [],
      improvement_areas: analysis.improvement_areas ?? [],
      updated_at: new Date().toISOString(),
    };

    // Store raw MediaPipe data
    if (mediapipeResults) {
      updatePayload.mediapipe_analysis = {
        pacing: mediapipeResults.pacing,
        hook: mediapipeResults.hook,
        contentClassification: mediapipeResults.contentClassification,
        processedAt: new Date().toISOString(),
        version: '1.0',
      };
    }

    // Update item with analysis data
    await adminClient
      .from('moodboard_items')
      .update(updatePayload)
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

/** Merge MediaPipe results into an already-analyzed item (LLM analysis already exists). */
function buildMediaPipeMerge(
  mp: NonNullable<z.infer<typeof mediapipeSchema>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any
): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  // Merge pacing
  if (item.pacing) {
    update.pacing = {
      ...item.pacing,
      estimated_cuts: mp.pacing.totalCuts,
      cuts_per_minute: mp.pacing.cutsPerMinute,
    };
  }

  // Combined hook score
  if (typeof item.hook_score === 'number') {
    update.hook_score = Math.max(
      1,
      Math.min(
        10,
        Math.round(0.6 * item.hook_score + 0.4 * mp.hook.attentionGrabScore)
      )
    );
  }

  // Store raw MediaPipe data
  update.mediapipe_analysis = {
    pacing: mp.pacing,
    hook: mp.hook,
    contentClassification: mp.contentClassification,
    processedAt: new Date().toISOString(),
    version: '1.0',
  };

  return update;
}
