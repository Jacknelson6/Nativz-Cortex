import { createCompletion, type AICompletionResponse } from '@/lib/ai/client';
import { getBrandProfile } from '@/lib/knowledge/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  findConstraintViolations,
  formatClientConstraintsForPrompt,
  getActiveClientConstraints,
} from '@/lib/knowledge/client-constraints';

type Admin = ReturnType<typeof createAdminClient>;

export type SpokenScriptGenerationInput = {
  admin: Admin;
  clientId: string;
  title: string;
  why_it_works?: string | string[];
  content_pillar?: string;
  reference_video_ids?: string[];
  cta?: string;
  video_length_seconds?: number;
  target_word_count?: number;
  hook_strategies?: string[];
  userId: string;
  userEmail?: string;
};

const HOOK_STRATEGY_MAP: Record<string, string> = {
  negative: 'Negative hook — open with a pain point, warning, or "stop doing this" framing',
  curiosity:
    'Curiosity gap — tease information the viewer needs to keep watching ("You won\'t believe...", "Here\'s what nobody tells you...")',
  controversial: 'Hot take / controversial — lead with an unpopular opinion or bold claim that sparks debate',
  story: 'Story-based — start with a personal anecdote or "so this happened..." narrative hook',
  authority: 'Authority / proof — establish credibility upfront ("After 10 years...", "I tested this for 30 days...")',
  question:
    'Direct question — open with a pointed question that makes the viewer reflect ("Why are you still...?", "Did you know...?")',
  listicle: 'Listicle / number — lead with a specific number ("3 things you need to know...", "The #1 reason...")',
  fomo: 'FOMO — create urgency or exclusion ("Everyone is doing this except you", "You\'re losing money if...")',
  tutorial: 'Tutorial / how-to — promise actionable instruction ("Here\'s exactly how to...", "Watch me do...")',
};

/**
 * Loads brand + optional reference video context and returns a spoken-word script
 * (same behavior as POST /api/ideas/generate-script). Used by the API route and
 * the full strategy pipeline (slice C).
 */
export async function generateSpokenScript(
  input: SpokenScriptGenerationInput,
): Promise<Pick<AICompletionResponse, 'usage' | 'estimatedCost'> & { scriptText: string }> {
  const {
    admin,
    clientId,
    title,
    why_it_works,
    content_pillar,
    reference_video_ids,
    cta,
    video_length_seconds,
    target_word_count,
    hook_strategies,
    userId,
    userEmail,
  } = input;

  const [brandProfile, clientRecord, referenceVideos] = await Promise.all([
    getBrandProfile(clientId),
    admin
      .from('clients')
      .select('name, industry, target_audience, brand_voice')
      .eq('id', clientId)
      .maybeSingle()
      .then(({ data }) => data),
    reference_video_ids?.length
      ? admin
          .from('reference_videos')
          .select('title, transcript, visual_analysis')
          .in('id', reference_video_ids)
          .eq('status', 'completed')
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
  ]);
  const clientConstraints = await getActiveClientConstraints(admin, clientId);
  const constraintBlock = formatClientConstraintsForPrompt(clientConstraints);

  const contextBlocks: string[] = [];

  if (clientRecord) {
    contextBlocks.push(
      `<brand>
Name: ${clientRecord.name ?? ''}
Industry: ${clientRecord.industry ?? ''}
Target audience: ${clientRecord.target_audience ?? ''}
Brand voice: ${clientRecord.brand_voice ?? ''}
</brand>`,
    );
  }

  if (brandProfile) {
    contextBlocks.push(`<brand_profile>\n${(brandProfile.content ?? '').substring(0, 3000)}\n</brand_profile>`);
  }

  if (constraintBlock) {
    contextBlocks.push(constraintBlock);
  }

  if (referenceVideos.length > 0) {
    const refContext = referenceVideos
      .map((v, i) => {
        const parts: string[] = [`Reference ${i + 1}: ${v.title ?? 'Untitled'}`];
        if (v.transcript) parts.push(`Script: ${(v.transcript as string).substring(0, 1500)}`);
        const analysis = v.visual_analysis as Record<string, unknown> | null;
        if (analysis?.overallStyle) parts.push(`Style: ${analysis.overallStyle}`);
        if (analysis?.contentStructure) parts.push(`Structure: ${JSON.stringify(analysis.contentStructure)}`);
        return parts.join('\n');
      })
      .join('\n\n');
    contextBlocks.push(`<reference_style_guide>\n${refContext}\n</reference_style_guide>`);
  }

  const whyText = Array.isArray(why_it_works) ? why_it_works.join('. ') : why_it_works;
  contextBlocks.push(`<video_idea>
Title: ${title}
${whyText ? `Why it works: ${whyText}` : ''}
${content_pillar ? `Content pillar: ${content_pillar}` : ''}
${cta ? `Desired CTA: ${cta}` : ''}
</video_idea>`);

  const lengthSeconds = video_length_seconds ?? 60;
  const wordCount = target_word_count ?? Math.round((lengthSeconds / 60) * 130);

  const hookInstructions = hook_strategies?.length
    ? `- Use one of these hook styles for the opening: ${hook_strategies.map((h) => HOOK_STRATEGY_MAP[h] ?? h).join('; ')}`
    : '';

  const systemPrompt = `You are a professional video script writer for a marketing agency. Write a spoken-word script for the given video idea.

Rules:
- Write ONLY the words that will be spoken on camera. No stage directions, no shot lists, no pacing notes, no "[cut to]" annotations.
- The script is for a ${lengthSeconds}-second short-form video. Write EXACTLY ${wordCount} words (±10%). Do NOT exceed ${Math.round(wordCount * 1.1)} words. Count carefully — shorter is better than longer.
- Match the brand voice and tone
- Obey every hard client constraint. Do not mention, recommend, imply, or script around forbidden offerings, claims, phrases, CTAs, topics, audiences, or channels.
- Start with a strong hook that grabs attention in the first 3 seconds
${hookInstructions ? `${hookInstructions}\n` : ''}- End with a clear call to action${cta ? ` — the CTA should drive viewers to: ${cta}` : ''}
${referenceVideos.length > 0 ? '- Match the style, energy, and delivery cadence of the reference videos' : ''}

Output ONLY the script text. Nothing else — no title, no labels, no formatting markers.`;

  let result = await createCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contextBlocks.join('\n\n') },
    ],
    maxTokens: 2000,
    feature: 'script_generation',
    userId,
    userEmail,
  });

  const violations = findConstraintViolations(result.text, clientConstraints);
  if (violations.length > 0) {
    const violationSummary = violations
      .slice(0, 8)
      .map((v) => `- Avoid "${v.term}" (${v.title})`)
      .join('\n');

    const retry = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextBlocks.join('\n\n') },
        {
          role: 'assistant',
          content: result.text,
        },
        {
          role: 'user',
          content: `Rewrite the script because it violated active hard client constraints:\n${violationSummary}\n\nReturn only a compliant spoken-word script. Do not mention the forbidden items even as negatives or disclaimers.`,
        },
      ],
      maxTokens: 2000,
      feature: 'script_generation',
      userId,
      userEmail,
    });

    result = {
      ...retry,
      usage: {
        promptTokens: result.usage.promptTokens + retry.usage.promptTokens,
        completionTokens: result.usage.completionTokens + retry.usage.completionTokens,
        totalTokens: result.usage.totalTokens + retry.usage.totalTokens,
      },
      estimatedCost: result.estimatedCost + retry.estimatedCost,
    };

    const retryViolations = findConstraintViolations(result.text, clientConstraints);
    if (retryViolations.length > 0) {
      const blockedTerms = retryViolations
        .slice(0, 8)
        .map((v) => `"${v.term}"`)
        .join(', ');
      throw new Error(`Generated script violated active client constraints after retry: ${blockedTerms}`);
    }
  }

  return {
    scriptText: result.text.trim(),
    usage: result.usage,
    estimatedCost: result.estimatedCost,
  };
}
