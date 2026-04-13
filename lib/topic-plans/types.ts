import { z } from 'zod';

/**
 * Shape of a topic-plan artifact. Persisted verbatim in topic_plans.plan_json,
 * consumed by the DOCX builder, and validated at the tool call boundary.
 *
 * Keep this schema stable — the Nerd's create_topic_plan tool renders
 * against it. Add optional fields rather than breaking existing plans.
 */

// Resonance is an open vocabulary the Nerd reaches into freely. We keep a
// canonical set for typed UI logic but accept any string the model emits and
// normalize at render time, so a "viral" or "explosive" tag doesn't fail the
// whole plan.
export const RESONANCE_CANONICAL = ['high', 'medium', 'low', 'rising', 'viral'] as const;
export const resonanceSchema = z.string().min(1);
export type Resonance = (typeof RESONANCE_CANONICAL)[number];

export const topicIdeaSchema = z.object({
  /** 1-based index within the series. The Nerd fills this; the builder respects it. */
  number: z.number().int().positive().nullish(),
  /** Short headline — the idea itself. "Why Smart Kids Still Struggle With Math". */
  title: z.string().min(2).max(200),
  /** Which topic search / trending topic this came from. Free text. */
  source: z.string().max(200).nullish(),
  /** Audience size in absolute count (e.g. 1_420_000_000). */
  audience: z.number().int().nonnegative().nullish(),
  /** Positive sentiment percentage, 0-100. */
  positive_pct: z.number().min(0).max(100).nullish(),
  /** Negative sentiment percentage, 0-100. */
  negative_pct: z.number().min(0).max(100).nullish(),
  resonance: resonanceSchema.nullish(),
  priority: z.boolean().nullish(),
  /** 1-2 sentences — why this topic is on-brand for the client. */
  why_it_works: z.string().max(600).nullish(),
});
export type TopicIdea = z.infer<typeof topicIdeaSchema>;

export const topicSeriesSchema = z.object({
  name: z.string().min(1).max(150),
  /** Optional one-liner under the series heading. */
  tagline: z.string().max(300).nullish(),
  /** Aggregate audience for the series. */
  total_views: z.number().int().nonnegative().nullish(),
  /** Average or aggregate engagement rate, 0-1 (e.g. 0.047). */
  engagement_rate: z.number().min(0).max(1).nullish(),
  ideas: z.array(topicIdeaSchema).min(1).max(60),
});
export type TopicSeries = z.infer<typeof topicSeriesSchema>;

export const topicPlanSchema = z.object({
  /** Title shown on the cover + DOCX filename root. */
  title: z.string().min(2).max(200),
  /** Subtitle / sell line under the title. */
  subtitle: z.string().max(400).nullish(),
  /** One or more series. Always at least one, even if it's just "All ideas". */
  series: z.array(topicSeriesSchema).min(1).max(20),
  /** North-star metric this plan targets. "Placement Test Bookings", etc. */
  north_star_metric: z.string().max(200).nullish(),
  /** Recommended content split. Free text. */
  content_split_note: z.string().max(500).nullish(),
});
// Note: client_id and topic_search_ids live as table columns (topic_plans
// row), not inside plan_json. Storing them in JSON would require the Nerd
// to pass them twice, and any drift between the two copies surfaces as
// "Plan data is corrupted" when the docx route re-parses on download.
export type TopicPlan = z.infer<typeof topicPlanSchema>;

/**
 * Format large audience counts the way Kumon's plan reads — "5.31B" / "248.38M"
 * / "132.64M". The DOCX builder and any UI card should use this.
 */
export function formatAudience(n: number | undefined): string {
  if (!n || n < 0) return '';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.?0+$/, '')}K`;
  return String(n);
}

export function resonanceLabel(r: string | null | undefined): string {
  if (!r) return '';
  return r.toUpperCase();
}

/** Map any resonance string to one of our canonical buckets so UI/sorting
 * logic doesn't have to pattern-match the open vocabulary. */
export function normalizeResonance(r: string | null | undefined): Resonance | null {
  if (!r) return null;
  const lower = r.trim().toLowerCase();
  if (lower === 'viral' || lower === 'explosive') return 'viral';
  if (lower === 'high' || lower === 'strong') return 'high';
  if (lower === 'rising' || lower === 'trending' || lower === 'emerging') return 'rising';
  if (lower === 'medium' || lower === 'moderate') return 'medium';
  if (lower === 'low' || lower === 'weak') return 'low';
  // Unknown string — surface a string but don't let it claim canonical status.
  return null;
}

export function totalIdeas(plan: TopicPlan): number {
  return plan.series.reduce((sum, s) => sum + s.ideas.length, 0);
}

export function totalHighResonance(plan: TopicPlan): number {
  return plan.series.reduce((sum, s) => {
    return sum + s.ideas.filter((i) => {
      const n = normalizeResonance(i.resonance);
      return n === 'high' || n === 'viral';
    }).length;
  }, 0);
}
