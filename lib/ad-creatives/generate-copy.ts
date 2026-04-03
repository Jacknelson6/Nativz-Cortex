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
 * Resolve model preference: explicit param wins, then env `AD_COPY_OPENROUTER_MODEL`, then platform default OpenRouter model.
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
- Do not use generic filler — every word should earn its place
- Output ONLY valid JSON: no markdown fences, no commentary; every string must be closed and the "copies" array must be complete`;

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

  const brandLock = [
    `NON-NEGOTIABLE: Every headline and subheadline must sound like "${brandContext.clientName}" (${brandContext.clientIndustry}) talking to their real customer — not generic SaaS, fintech, or unrelated categories.`,
    brandContext.audience.summary?.trim()
      ? `Reader: ${brandContext.audience.summary.trim().slice(0, 500)}${brandContext.audience.summary.length > 500 ? '…' : ''}`
      : null,
    brandContext.positioning?.trim()
      ? `Positioning to respect: ${brandContext.positioning.trim().slice(0, 400)}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = `Generate ${count} unique sets of ad copy for the following:

${brandLock}

Brand: ${brandContext.clientName}
Industry: ${brandContext.clientIndustry}
Product/Service: ${productService}${offer ? `\nOffer: ${offer}` : ''}${positioning}${audience}
${ctaFixed ? `\nBUTTON LABEL (same for every set — copy exactly into the "cta" field each time): "${ctaFixed}"` : ''}

${toneGuidance ? `BRAND VOICE GUIDELINES:\n${toneGuidance}` : ''}${pillars}${supplementBlock}

Return exactly ${count} sets as JSON.`;

  const maxTokens = Math.min(8192, 512 + Math.ceil(count * 340));
  let lastText = '';
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens,
      feature: 'ad_copy_generation',
      modelPreference: resolveAdCopyOpenRouterPreference(openRouterModelPreference),
    });
    lastText = result.text;
    const jsonText = extractJson(result.text);
    try {
      const parsed = responseSchema.parse(JSON.parse(jsonText));
      const copies = parsed.copies.slice(0, count);
      if (copies.length < count) {
        throw new Error(`Expected ${count} copies, got ${copies.length}`);
      }
      if (ctaFixed) {
        return copies.map((c) => ({ ...c, cta: ctaFixed }));
      }
      return copies;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[generate-copy] parse attempt ${attempt + 1} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  console.error('[generate-copy] failed to parse AI response:', lastText.substring(0, 800));
  throw new Error(
    `Failed to parse ad copy response: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

/** Smaller chunks avoid truncated JSON from models with tight output limits (e.g. free tier). */
const DEFAULT_COPY_CHUNK = 10;

/**
 * Generate `count` unique copy rows in chunks to stay within model output limits.
 */
export async function generateAdCopyBatched(
  params: Omit<GenerateAdCopyParams, 'count'> & { count: number; chunkSize?: number },
): Promise<OnScreenText[]> {
  const { count, chunkSize = DEFAULT_COPY_CHUNK, ...rest } = params;
  if (count <= 0) return [];
  const out: OnScreenText[] = [];

  async function oneChunk(n: number): Promise<OnScreenText[]> {
    try {
      return await generateAdCopy({ ...rest, count: n });
    } catch (e) {
      if (n <= 1) throw e;
      const a = Math.ceil(n / 2);
      const b = n - a;
      const left = await oneChunk(a);
      const right = await oneChunk(b);
      return [...left, ...right];
    }
  }

  for (let offset = 0; offset < count; offset += chunkSize) {
    const n = Math.min(chunkSize, count - offset);
    console.log(
      `[generate-copy] batched chunk ${offset + 1}–${offset + n} of ${count} (${n} set(s))…`,
    );
    const chunk = await oneChunk(n);
    out.push(...chunk);
  }
  return out.slice(0, count);
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
