import { z } from 'zod';
import { createCompletion } from '@/lib/ai/client';
import { resolveAdCopyOpenRouterPreference } from './generate-copy';
import type { AdvertisingType } from './types';
import type { CompiledBrandDNA } from '@/lib/brand-dna/types';

const modifierSchema = z.object({
  modifier: z.string().max(2500),
});

const ADVERTISING_LABEL: Record<AdvertisingType, string> = {
  product_dtc: 'Physical or DTC product brand',
  saas_service: 'B2B SaaS or software service',
  marketplace: 'Marketplace or multi-sided platform',
  local_service: 'Local service or brick-and-mortar',
};

/** Cap guideline text so the completion request stays bounded. */
const MAX_GUIDELINE_CHARS = 24_000;

/**
 * Derive a reusable image-generation style modifier from the Brand DNA compile output.
 * Call in the same run as `compileBrandDocument` / `storeBrandDNANodes` — uses `compiled.content`
 * directly (no second `getBrandContext` round trip).
 */
export async function generateImagePromptModifierFromDNA(params: {
  advertisingType: AdvertisingType;
  compiled: CompiledBrandDNA;
  clientName: string;
  clientIndustry: string;
}): Promise<string> {
  const { advertisingType, compiled, clientName, clientIndustry } = params;
  const meta = compiled.metadata;

  const guideline =
    compiled.content.length > MAX_GUIDELINE_CHARS
      ? `${compiled.content.slice(0, MAX_GUIDELINE_CHARS)}…`
      : compiled.content;

  const system = `You are a senior performance creative director. Output ONLY valid JSON with a single key "modifier" — no markdown.
The value is 2–5 short sentences of GLOBAL direction for static ad IMAGE generation (not copywriting): camera distance, lighting bias, color discipline, texture, level of polish, what to avoid visually for this brand category.
Do not repeat headline rules or CTA rules. Do not list exact hex codes unless critical. No bullet characters inside the string.`;

  const user = [
    `Advertising model: ${ADVERTISING_LABEL[advertisingType]}`,
    `Brand: ${clientName}`,
    `Industry: ${clientIndustry}`,
    meta.competitive_positioning?.trim() ? `Positioning: ${meta.competitive_positioning.trim()}` : null,
    meta.target_audience_summary?.trim() ? `Audience: ${meta.target_audience_summary.trim()}` : null,
    meta.tone_primary?.trim() ? `Voice: ${meta.tone_primary.trim()}` : null,
    `Brand DNA document (same generation run — full grounding):\n${guideline}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: 600,
      feature: 'ad_image_prompt_modifier',
      modelPreference: resolveAdCopyOpenRouterPreference(),
    });

    const raw = result.text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return '';
    const parsed = modifierSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) return '';
    return parsed.data.modifier.trim();
  } catch (e) {
    console.warn(
      '[generate-image-prompt-modifier] failed:',
      e instanceof Error ? e.message : e,
    );
    return '';
  }
}
