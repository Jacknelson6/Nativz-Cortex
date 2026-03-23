// ---------------------------------------------------------------------------
// Static Ad Generation — AI Copy Generation
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { createCompletion } from '@/lib/ai/client';
import { DEFAULT_OPENROUTER_MODEL } from '@/lib/ai/openrouter-default-model';
import type { BrandContext } from '@/lib/knowledge/brand-context';
import type { OnScreenText } from './types';

const onScreenTextSchema = z.object({
  headline: z.string().max(60),
  subheadline: z.string().max(120),
  cta: z.string().max(30),
});

const responseSchema = z.object({
  copies: z.array(onScreenTextSchema),
});

/** Same as platform default OpenRouter model unless overridden by `AD_COPY_OPENROUTER_MODEL`. */
export const AD_COPY_DEFAULT_OPENROUTER_MODEL = DEFAULT_OPENROUTER_MODEL;

interface GenerateAdCopyParams {
  brandContext: BrandContext;
  productService: string;
  offer: string | null;
  count: number;
  /**
   * When set, every returned row uses this exact CTA (enforced after parse).
   * Headline and subheadline still vary per row.
   */
  fixedCta?: string | null;
  /**
   * OpenRouter ids tried before agency primary + fallbacks.
   * Omit to use `AD_COPY_OPENROUTER_MODEL` (comma-separated) or {@link AD_COPY_DEFAULT_OPENROUTER_MODEL}.
   */
  openRouterModelPreference?: string[];
}

/**
 * Resolve model preference: explicit param wins, then env `AD_COPY_OPENROUTER_MODEL`, then Nemotron 3 free.
 */
export function resolveAdCopyOpenRouterPreference(explicit?: string[] | null): string[] {
  if (explicit && explicit.length > 0) return explicit;
  const fromEnv =
    process.env.AD_COPY_OPENROUTER_MODEL?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  if (fromEnv.length > 0) return fromEnv;
  return [AD_COPY_DEFAULT_OPENROUTER_MODEL];
}

/**
 * Generate multiple unique sets of on-screen ad copy (headline, subheadline, CTA)
 * using the brand's verbal identity for tone and vocabulary.
 */
export async function generateAdCopy(params: GenerateAdCopyParams): Promise<OnScreenText[]> {
  const { brandContext, productService, offer, count, fixedCta, openRouterModelPreference } = params;
  const verbal = brandContext.verbalIdentity;
  const ctaFixed = fixedCta?.trim().slice(0, 30) || null;

  const toneGuidance = [
    verbal.tonePrimary ? `Primary tone: ${verbal.tonePrimary}` : null,
    verbal.voiceAttributes.length > 0
      ? `Voice attributes: ${verbal.voiceAttributes.join(', ')}`
      : null,
    verbal.vocabularyPatterns.length > 0
      ? `Vocabulary patterns to use: ${verbal.vocabularyPatterns.join(', ')}`
      : null,
    verbal.avoidancePatterns.length > 0
      ? `Words/topics to AVOID: ${verbal.avoidancePatterns.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const systemPrompt = `You are an expert advertising copywriter. You write concise, high-converting ad copy that matches a brand's voice and tone.

Always return valid JSON matching this exact schema:
{
  "copies": [
    { "headline": "...", "subheadline": "...", "cta": "..." }
  ]
}

Rules:
- headline: max 8 words, punchy, attention-grabbing
- subheadline: max 15 words, supports the headline with a benefit or detail
- cta: max 4 words, clear action (e.g. "Shop now", "Get started", "Learn more")${ctaFixed ? `\n- CRITICAL: Every copy object must use this EXACT cta string (character-for-character): "${ctaFixed}"` : '\n- cta may vary between sets'}
- Each set must be unique — vary the angle, emotion, or framing (headline + subheadline only${ctaFixed ? '; keep cta identical across all sets' : ', including cta'})
- Match the brand's tone and vocabulary exactly
- Factual discipline: only claims that fit the product/service and brand materials below — do NOT invent features, metrics, integrations, or industries the brand does not serve
- Do not use generic filler — every word should earn its place`;

  const supplement = brandContext.creativeSupplementBlock?.trim();
  const supplementBlock =
    supplement && supplement.length > 0
      ? `\n\nUPLOADED BRAND MATERIALS (follow claims, vocabulary, and offer language where relevant):\n${
          supplement.length > 6000 ? `${supplement.slice(0, 6000)}\n...(truncated)` : supplement
        }`
      : '';

  const pillars =
    brandContext.verbalIdentity.messagingPillars.length > 0
      ? `\nMessaging pillars (stay aligned; do not promise things outside these + the product description):\n${brandContext.verbalIdentity.messagingPillars.map((p) => `- ${p}`).join('\n')}`
      : '';

  const positioning = brandContext.positioning?.trim()
    ? `\nPositioning: ${brandContext.positioning.trim()}`
    : '';
  const audience = brandContext.audience?.summary?.trim()
    ? `\nAudience: ${brandContext.audience.summary.trim()}`
    : '';

  const userPrompt = `Generate ${count} unique sets of ad copy for the following:

Brand: ${brandContext.clientName}
Industry: ${brandContext.clientIndustry}
Product/Service: ${productService}${offer ? `\nOffer: ${offer}` : ''}${positioning}${audience}
${ctaFixed ? `\nBUTTON LABEL (same for every set — copy exactly into the "cta" field each time): "${ctaFixed}"` : ''}

${toneGuidance ? `BRAND VOICE GUIDELINES:\n${toneGuidance}` : ''}${pillars}${supplementBlock}

Return exactly ${count} sets as JSON.`;

  const result = await createCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: Math.min(8192, 400 + count * 100),
    feature: 'ad_copy_generation',
    modelPreference: resolveAdCopyOpenRouterPreference(openRouterModelPreference),
  });

  // Extract JSON from the response (handle markdown code blocks)
  const jsonText = extractJson(result.text);

  let parsed: z.infer<typeof responseSchema>;
  try {
    parsed = responseSchema.parse(JSON.parse(jsonText));
  } catch (err) {
    console.error('[generate-copy] failed to parse AI response:', result.text.substring(0, 500));
    throw new Error(
      `Failed to parse ad copy response: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const copies = parsed.copies.slice(0, count);
  if (ctaFixed) {
    return copies.map((c) => ({ ...c, cta: ctaFixed }));
  }
  return copies;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractJson(text: string): string {
  // Try to extract from markdown code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return text.trim();
}
