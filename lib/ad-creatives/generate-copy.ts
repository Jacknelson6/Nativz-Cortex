// ---------------------------------------------------------------------------
// Static Ad Generation — AI Copy Generation
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { createCompletion } from '@/lib/ai/client';
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

interface GenerateAdCopyParams {
  brandContext: BrandContext;
  productService: string;
  offer: string | null;
  count: number;
}

/**
 * Generate multiple unique sets of on-screen ad copy (headline, subheadline, CTA)
 * using the brand's verbal identity for tone and vocabulary.
 */
export async function generateAdCopy(params: GenerateAdCopyParams): Promise<OnScreenText[]> {
  const { brandContext, productService, offer, count } = params;
  const verbal = brandContext.verbalIdentity;

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
- cta: max 4 words, clear action (e.g. "Shop Now", "Get Started", "Learn More")
- Each set must be unique — vary the angle, emotion, or framing
- Match the brand's tone and vocabulary exactly
- Do not use generic filler — every word should earn its place`;

  const supplement = brandContext.creativeSupplementBlock?.trim();
  const supplementBlock =
    supplement && supplement.length > 0
      ? `\n\nUPLOADED BRAND MATERIALS (follow claims, vocabulary, and offer language where relevant):\n${
          supplement.length > 6000 ? `${supplement.slice(0, 6000)}\n...(truncated)` : supplement
        }`
      : '';

  const userPrompt = `Generate ${count} unique sets of ad copy for the following:

Brand: ${brandContext.clientName}
Industry: ${brandContext.clientIndustry}
Product/Service: ${productService}${offer ? `\nOffer: ${offer}` : ''}

${toneGuidance ? `BRAND VOICE GUIDELINES:\n${toneGuidance}` : ''}${supplementBlock}

Return exactly ${count} sets as JSON.`;

  const result = await createCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 1024,
    feature: 'ad_copy_generation',
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

  return parsed.copies.slice(0, count);
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
