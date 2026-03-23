import { z } from 'zod';
import { createCompletion } from '@/lib/ai/client';
import type { BrandContext } from '@/lib/knowledge/brand-context';
import { resolveAdCopyOpenRouterPreference } from './generate-copy';

const briefSchema = z.object({
  heroMotif: z.string().max(500),
  visualAvoid: z.string().max(500),
  mood: z.string().max(280),
});

/**
 * One LLM call per batch — brand-grounded hero direction for text-free image generation.
 * Returns a compact paragraph safe to inject into image prompts (no JSON in output).
 */
export async function generateCreativeBrief(params: {
  brandContext: BrandContext;
  productService: string;
  offer: string | null;
}): Promise<string> {
  const { brandContext, productService, offer } = params;

  const system = `You are a senior art director. Output ONLY valid JSON with keys heroMotif, visualAvoid, mood — no markdown.
heroMotif: one sentence — what the abstract hero should evoke for THIS brand (light, material, metaphor). Ban vague "AI energy", "neural networks", "data streams", "glowing nodes", "holographic ribbons", "purple-pink gradient orbs", "mesh spheres", or "futuristic city". Prefer one specific, restrained image idea (e.g. dawn horizon band, paper grain with single violet edge light, shallow fog plane, soft prism edge — still zero text).
visualAvoid: comma-separated list of what must NOT appear — always include generic AI-SaaS marketing clipart and "instant campaign" tropes (URL bars, ad conveyor belts, robot marketers, magic wands, lightning on laptops) plus any wrong industries, fake dashboards, social UI chrome, and chart widgets.
mood: 3-6 words — premium editorial or calm product, not hype or carnival.`;

  const user = [
    `Brand: ${brandContext.clientName}`,
    `Industry: ${brandContext.clientIndustry}`,
    `Product/service: ${productService}`,
    offer ? `Offer context: ${offer}` : null,
    brandContext.positioning?.trim() ? `Positioning: ${brandContext.positioning.trim()}` : null,
    brandContext.audience?.summary?.trim() ? `Audience: ${brandContext.audience.summary.trim()}` : null,
    brandContext.verbalIdentity.tonePrimary
      ? `Voice: ${brandContext.verbalIdentity.tonePrimary}`
      : null,
    brandContext.verbalIdentity.messagingPillars.length > 0
      ? `Pillars: ${brandContext.verbalIdentity.messagingPillars.join('; ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: 500,
      feature: 'ad_creative_brief',
      modelPreference: resolveAdCopyOpenRouterPreference(),
    });

    const raw = result.text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return '';
    const parsed = briefSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) return '';

    const { heroMotif, visualAvoid, mood } = parsed.data;
    return [
      `CREATIVE BRIEF (follow for the hero only — still zero text on canvas):`,
      `- Hero motif: ${heroMotif}`,
      `- Avoid: ${visualAvoid}`,
      `- Mood: ${mood}`,
    ].join('\n');
  } catch (e) {
    console.warn('[generate-creative-brief] failed:', e instanceof Error ? e.message : e);
    return '';
  }
}
