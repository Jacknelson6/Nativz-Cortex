import { z } from 'zod';

/**
 * Shape of a topic-plan artifact. Persisted verbatim in topic_plans.plan_json,
 * consumed by the DOCX builder, and validated at the tool call boundary.
 *
 * Keep this schema stable — the Nerd's create_topic_plan tool renders
 * against it. Add optional fields rather than breaking existing plans.
 */

export const resonanceSchema = z.enum(['high', 'medium', 'low', 'rising']);
export type Resonance = z.infer<typeof resonanceSchema>;

export const topicIdeaSchema = z.object({
  /** 1-based index within the series. The Nerd fills this; the builder respects it. */
  number: z.number().int().positive().optional(),
  /** Short headline — the idea itself. "Why Smart Kids Still Struggle With Math". */
  title: z.string().min(2).max(200),
  /** Which topic search / trending topic this came from. Free text. */
  source: z.string().max(200).optional(),
  /** Audience size in absolute count (e.g. 1_420_000_000). */
  audience: z.number().int().nonnegative().optional(),
  /** Positive sentiment percentage, 0-100. */
  positive_pct: z.number().min(0).max(100).optional(),
  /** Negative sentiment percentage, 0-100. */
  negative_pct: z.number().min(0).max(100).optional(),
  resonance: resonanceSchema.optional(),
  priority: z.boolean().optional(),
  /** 1-2 sentences — why this topic is on-brand for the client. */
  why_it_works: z.string().max(600).optional(),
});
export type TopicIdea = z.infer<typeof topicIdeaSchema>;

export const topicSeriesSchema = z.object({
  name: z.string().min(1).max(150),
  /** Optional one-liner under the series heading. */
  tagline: z.string().max(300).optional(),
  /** Aggregate audience for the series. */
  total_views: z.number().int().nonnegative().optional(),
  /** Average or aggregate engagement rate, 0-1 (e.g. 0.047). */
  engagement_rate: z.number().min(0).max(1).optional(),
  ideas: z.array(topicIdeaSchema).min(1).max(60),
});
export type TopicSeries = z.infer<typeof topicSeriesSchema>;

export const topicPlanSchema = z.object({
  /** Title shown on the cover + DOCX filename root. */
  title: z.string().min(2).max(200),
  /** Subtitle / sell line under the title. */
  subtitle: z.string().max(400).optional(),
  /** Client the plan is for — uuid. */
  client_id: z.string().uuid(),
  /** Source topic search rows grounding the plan. */
  topic_search_ids: z.array(z.string().uuid()).max(10).default([]),
  /** One or more series. Always at least one, even if it's just "All ideas". */
  series: z.array(topicSeriesSchema).min(1).max(20),
  /** North-star metric this plan targets. "Placement Test Bookings", etc. */
  north_star_metric: z.string().max(200).optional(),
  /** Recommended content split. Free text. */
  content_split_note: z.string().max(500).optional(),
});
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

export function resonanceLabel(r: Resonance | undefined): string {
  switch (r) {
    case 'high': return 'HIGH';
    case 'medium': return 'MEDIUM';
    case 'low': return 'LOW';
    case 'rising': return 'RISING';
    default: return '';
  }
}

export function totalIdeas(plan: TopicPlan): number {
  return plan.series.reduce((sum, s) => sum + s.ideas.length, 0);
}

export function totalHighResonance(plan: TopicPlan): number {
  return plan.series.reduce(
    (sum, s) => sum + s.ideas.filter((i) => i.resonance === 'high').length,
    0,
  );
}
