/**
 * Adapters that map existing Cortex data types into BrandedDeliverableData.
 * Each adapter is a pure function — no DB calls, no side effects.
 *
 * Usage:
 *   import { mapTopicPlanToBranded } from '@/lib/pdf/branded/adapters';
 *   import { BrandedDeliverableDocument } from '@/lib/pdf/branded';
 *   import { getTheme } from '@/lib/branding';
 *
 *   const data = mapTopicPlanToBranded(plan, 'Safe Stop');
 *   <BrandedDeliverableDocument data={data} theme={getTheme('nativz')} />
 */

import type {
  BrandedDeliverableData,
  BrandedDeliverableSeries,
  BrandedDeliverableTopic,
  BrandedDeliverableMetric,
} from './types';
import type { TopicPlan, TopicIdea, TopicSeries } from '@/lib/topic-plans/types';
import { formatAudience, normalizeResonance, totalIdeas, totalHighResonance } from '@/lib/topic-plans/types';
import type { CompetitorReportData, CompetitorReportCompetitor } from '@/lib/reporting/competitor-report-types';

// ── Helpers ────────────────────────────────────────────────────────

function resonanceTagLabel(resonance: string | null | undefined): string | undefined {
  const n = normalizeResonance(resonance);
  if (!n) return undefined;
  const labels: Record<string, string> = {
    viral: 'Viral resonance',
    high: 'High resonance',
    rising: 'Rising resonance',
    medium: 'Medium resonance',
    low: 'Low resonance',
  };
  return labels[n];
}

function ideaMetrics(idea: TopicIdea): BrandedDeliverableMetric[] {
  const metrics: BrandedDeliverableMetric[] = [];
  if (idea.audience != null) {
    metrics.push({
      label: 'Audience',
      value: formatAudience(idea.audience),
      tone: 'neutral',
    });
  }
  if (idea.positive_pct != null) {
    metrics.push({
      label: 'Positive',
      value: `${Math.round(idea.positive_pct)}%`,
      tone: 'positive',
    });
  }
  if (idea.negative_pct != null) {
    metrics.push({
      label: 'Negative',
      value: `${Math.round(idea.negative_pct)}%`,
      tone: 'negative',
    });
  }
  return metrics;
}

function mapIdeaToTopic(idea: TopicIdea, seriesOffset: number): BrandedDeliverableTopic {
  const num = idea.number ?? seriesOffset;
  return {
    number: `${String(num).padStart(2, '0')}.`,
    title: idea.title,
    source: idea.source ?? undefined,
    resonanceLabel: resonanceTagLabel(idea.resonance),
    priorityLabel: idea.priority ? 'Priority' : undefined,
    metrics: ideaMetrics(idea),
    whyItWorks: idea.why_it_works ?? undefined,
  };
}

function mapSeries(series: TopicSeries, index: number): BrandedDeliverableSeries {
  const ideaCount = series.ideas.length;
  const highRes = series.ideas.filter((i) => {
    const n = normalizeResonance(i.resonance);
    return n === 'high' || n === 'viral';
  }).length;

  let globalOffset = 1;
  for (let s = 0; s < index; s++) {
    globalOffset += 0; // caller should pass cumulative offset if needed
  }

  return {
    label: `Series ${String(index + 1).padStart(2, '0')}`,
    title: series.name,
    subtitle: series.tagline ?? undefined,
    stats: [
      { value: String(ideaCount), label: 'Topics' },
      ...(highRes > 0 ? [{ value: String(highRes), label: 'High resonance' }] : []),
    ],
    topics: series.ideas.map((idea, i) => mapIdeaToTopic(idea, i + 1)),
  };
}

// ── Public adapters ───────────────────────────────────────────────

/**
 * Map a TopicPlan (from create_topic_plan tool output) to a branded PDF.
 * This is the primary `/generate` deliverable.
 */
export function mapTopicPlanToBranded(
  plan: TopicPlan,
  clientName: string,
  /** The deliverable type label — "Video Ideas", "Scripts", "Topics", etc.
   *  This becomes the big cover title. The plan's own title/subtitle feeds
   *  into the summary paragraph instead. */
  deliverableType: string = 'Video Ideas',
): BrandedDeliverableData {
  const total = totalIdeas(plan);
  const highRes = totalHighResonance(plan);

  // Cumulative numbering across series
  let cumulative = 0;
  const series = plan.series.map((s, i) => {
    const mapped = mapSeries(s, i);
    mapped.topics = s.ideas.map((idea, j) => {
      cumulative++;
      return mapIdeaToTopic(idea, cumulative);
    });
    return mapped;
  });

  return {
    eyebrow: clientName,
    kicker: 'Content Strategy',
    title: deliverableType,
    summary: plan.subtitle ?? `${total} short-form ${deliverableType.toLowerCase()} grounded in topic research for ${clientName}.`,
    stats: [
      { value: String(plan.series.length), label: 'Content pillars' },
      { value: String(total), label: 'Video topics' },
      ...(highRes > 0 ? [{ value: String(highRes), label: 'High resonance' }] : []),
    ],
    highlight: plan.north_star_metric
      ? { label: 'North Star Metric', value: plan.north_star_metric }
      : undefined,
    legend: {
      heading: 'How to read this document',
      intro:
        'Each topic sits inside a series and carries its resonance signal. Priority topics are the recommended first-film picks based on sentiment data — they generate the most shares, saves, and follows.',
      items: [
        { label: 'Viral resonance', description: 'Strongest signal — high engagement and sentiment in the source research.', tone: 'primary' },
        { label: 'High resonance', description: 'Solid signal — proven topics that consistently perform.', tone: 'positive' },
        { label: 'Medium resonance', description: 'Emerging signal — worth testing once priority topics are in flight.', tone: 'warning' },
      ],
      footnote:
        'Metrics come from the sentiment and audience counts in each underlying topic search. "Why it works" captures the editorial judgment behind each pick.',
    },
    series,
    runningHeaderTitle: clientName,
  };
}

/**
 * Map loose IdeaForPdf[] (from the older ideas-template path) to branded data.
 * Groups all ideas into a single "All Ideas" series.
 */
export function mapIdeasToBranded(
  ideas: Array<{
    title: string;
    why_it_works: string[];
    content_pillar: string;
    script?: string;
  }>,
  clientName: string,
  concept: string | null,
  searchQuery: string | null,
): BrandedDeliverableData {
  // Group by content_pillar → series
  const pillarMap = new Map<string, typeof ideas>();
  for (const idea of ideas) {
    const key = idea.content_pillar || 'General';
    if (!pillarMap.has(key)) pillarMap.set(key, []);
    pillarMap.get(key)!.push(idea);
  }

  let cumulative = 0;
  const series: BrandedDeliverableSeries[] = Array.from(pillarMap.entries()).map(
    ([pillar, pillarIdeas], i) => ({
      label: `Series ${String(i + 1).padStart(2, '0')}`,
      title: pillar,
      stats: [{ value: String(pillarIdeas.length), label: 'Topics' }],
      topics: pillarIdeas.map((idea) => {
        cumulative++;
        return {
          number: `${String(cumulative).padStart(2, '0')}.`,
          title: idea.title,
          metrics: [],
          whyItWorks: idea.why_it_works.join(' '),
        };
      }),
    }),
  );

  const heading = concept ?? 'video';

  return {
    eyebrow: clientName,
    kicker: 'Content Strategy',
    title: `${heading.charAt(0).toUpperCase() + heading.slice(1)} Ideas`,
    summary: searchQuery
      ? `${ideas.length} ${heading} ideas from ${searchQuery} research for ${clientName}.`
      : `${ideas.length} ${heading} ideas for ${clientName}.`,
    stats: [
      { value: String(pillarMap.size), label: 'Content pillars' },
      { value: String(ideas.length), label: `${heading} topics` },
    ],
    series,
    runningHeaderTitle: clientName,
  };
}

// ── Competitor report adapter ──────────────────────────────────────────────

function competitorMetrics(c: CompetitorReportCompetitor): BrandedDeliverableMetric[] {
  const metrics: BrandedDeliverableMetric[] = [];
  if (c.followers != null) {
    metrics.push({
      label: 'Followers',
      value: compact(c.followers),
      tone: deltaTone(c.followers_delta),
    });
  }
  if (c.avg_views != null) {
    metrics.push({
      label: 'Avg views',
      value: compact(c.avg_views),
      tone: deltaTone(c.avg_views_delta),
    });
  }
  if (c.engagement_rate != null) {
    metrics.push({
      label: 'Engagement',
      value: `${(c.engagement_rate * 100).toFixed(1)}%`,
      tone: deltaTone(c.engagement_rate_delta),
    });
  }
  if (c.posts_count != null) {
    metrics.push({
      label: 'Posts',
      value: compact(c.posts_count),
      tone: deltaTone(c.posts_count_delta),
    });
  }
  return metrics;
}

function compact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function deltaTone(
  delta: number | null | undefined,
): 'neutral' | 'positive' | 'negative' {
  if (delta == null || delta === 0) return 'neutral';
  return delta > 0 ? 'positive' : 'negative';
}

const PLATFORM_LABEL_PDF: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

function dateLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

export function mapCompetitorReportToBranded(data: CompetitorReportData): BrandedDeliverableData {
  const range = `${dateLabel(data.period_start)} – ${dateLabel(data.period_end)}`;
  const competitorCount = data.competitors.length;

  const topics: BrandedDeliverableTopic[] = data.competitors.map((c, idx) => {
    const title = c.display_name ?? c.username;
    const firstPost = c.top_posts[0];
    const whyItWorks = firstPost?.description
      ? `Top post: ${firstPost.description} (${compact(firstPost.views ?? 0)} views)`
      : c.scrape_error
        ? `Last scrape warning: ${c.scrape_error}`
        : 'No new posts captured this period.';

    return {
      number: `${String(idx + 1).padStart(2, '0')}.`,
      title,
      sourceLabel: 'Handle',
      source: `@${c.username}`,
      resonanceLabel: PLATFORM_LABEL_PDF[c.platform] ?? c.platform,
      metrics: competitorMetrics(c),
      whyItWorks,
    };
  });

  const series: BrandedDeliverableSeries[] = [
    {
      label: 'Competitors',
      title: `${competitorCount} competitor${competitorCount === 1 ? '' : 's'} watched`,
      subtitle: range,
      topics,
    },
  ];

  return {
    eyebrow: data.client_name,
    kicker: 'Competitor Update',
    title: 'Competitor Intelligence Report',
    summary: `${range} — ongoing benchmark of ${competitorCount} competitor${competitorCount === 1 ? '' : 's'}.`,
    stats: [
      { value: String(competitorCount), label: 'Competitors' },
      { value: data.cadence, label: 'Cadence' },
    ],
    series,
    runningHeaderTitle: data.client_name,
  };
}

