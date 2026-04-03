'use client';

import { Flame, Quote } from 'lucide-react';
import type { TopicSearchAIResponse, ContentBreakdownItem, TrendingTopic } from '@/lib/types/search';
import { formatPillarLabelForDisplay } from '@/lib/search/format-pillar-label';
import { formatEngagementRatePercent } from '@/lib/search/format-engagement-rate';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { TOOLTIPS } from '@/lib/tooltips';

interface AiTakeawaysProps {
  aiResponse: TopicSearchAIResponse | null;
  summary: string | null;
  clientName?: string | null;
  /** When a client is linked to the search — shows Your ER from the model when present. */
  hasAttachedClient?: boolean;
}

/**
 * Match a category label to the best hook from the topic video ideas.
 * Scoring: keyword overlap between category name tokens and hook text.
 */
function pickHookForCategory(
  category: ContentBreakdownItem,
  topics: TrendingTopic[],
  usedHooks: Set<string>,
): string | null {
  const catTokens = category.name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 2);

  let best: { hook: string; score: number } | null = null;

  for (const topic of topics) {
    for (const idea of topic.video_ideas ?? []) {
      if (!idea.hook || usedHooks.has(idea.hook)) continue;
      const hookLower = idea.hook.toLowerCase();
      let score = 0;
      for (const token of catTokens) {
        if (hookLower.includes(token)) score++;
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { hook: idea.hook, score };
      }
    }
  }

  if (best) {
    usedHooks.add(best.hook);
    return best.hook;
  }

  for (const topic of topics) {
    for (const idea of topic.video_ideas ?? []) {
      if (!idea.hook || usedHooks.has(idea.hook)) continue;
      usedHooks.add(idea.hook);
      return idea.hook;
    }
  }

  return null;
}

function cleanHookQuotes(hook: string): string {
  return hook.replace(/^[""\u201C]|[""\u201D]$/g, '').trim();
}

export function AiTakeaways({
  aiResponse,
  summary,
  clientName,
  hasAttachedClient,
}: AiTakeawaysProps) {
  if (!aiResponse && !summary) return null;

  const topics = (aiResponse?.trending_topics ?? []) as TrendingTopic[];

  const hasClient = hasAttachedClient ?? Boolean(clientName);

  const engagementDrivers: {
    title: string;
    titleDetail?: string;
    pctOfContent: string;
    erTypical: string;
    erYour: string;
    hook: string | null;
  }[] = (() => {
    const breakdown = aiResponse?.content_breakdown;
    const usedHooks = new Set<string>();

    if (breakdown?.categories?.length) {
      return breakdown.categories.slice(0, 4).map((c) => {
        const { headline, detail } = formatPillarLabelForDisplay(c.name);
        return {
          title: headline,
          titleDetail: detail,
          pctOfContent: `${c.percentage}%`,
          erTypical: formatEngagementRatePercent(c.engagement_rate),
          erYour: hasClient ? formatEngagementRatePercent(c.your_engagement_rate) : '—',
          hook: pickHookForCategory(c, topics, usedHooks),
        };
      });
    }

    if (topics.length) {
      return topics.slice(0, 4).map((t) => {
        const { headline, detail } = formatPillarLabelForDisplay(t.name);
        const firstHook = t.video_ideas?.[0]?.hook ?? null;
        return {
          title: headline,
          titleDetail: detail,
          pctOfContent: '—',
          erTypical: '—',
          erYour: '—',
          hook: firstHook,
        };
      });
    }
    return [];
  })();

  /** Brand alignment copy lives in Brand application (next to executive summary); avoid duplicating here */
  const pullQuote = aiResponse?.brand_alignment_notes?.trim()
    ? null
    : aiResponse?.conversation_themes?.[0]?.representative_quotes?.[0] ?? null;

  return (
    <div className="space-y-8">
      {/* Recommended content pillars — 4-up on xl, 2-up on md, stacks on mobile */}
      {engagementDrivers.length > 0 ? (
        <div className="space-y-4">
          <div className="border-b border-nativz-border/60 pb-4">
            <h4 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
              Recommended Content Pillars
            </h4>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4 2xl:gap-5">
            {engagementDrivers.map((driver, i) => {
              const displayHook = driver.hook ? cleanHookQuotes(driver.hook) : null;

              return (
                <div
                  key={i}
                  className="group relative flex h-full min-h-0 flex-col rounded-xl border border-nativz-border bg-surface p-4 sm:p-5 ring-1 ring-accent/30 transition-all hover:ring-2 hover:ring-accent/40"
                >
                  <div className="mb-3 flex items-start gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-surface">
                      <Flame size={16} className="text-accent-text" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold leading-snug text-text-primary line-clamp-2">
                        {driver.title}
                      </p>
                      {driver.titleDetail ? (
                        <p className="mt-1 text-xs leading-snug text-text-muted/95 line-clamp-2">
                          {driver.titleDetail}
                        </p>
                      ) : null}
                      <dl className="mt-2 space-y-1 text-sm leading-relaxed tabular-nums">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                          <dt className="text-text-muted/90">
                            <TooltipCard
                              title={TOOLTIPS.pillar_pct_of_content.title}
                              description={TOOLTIPS.pillar_pct_of_content.description}
                            >
                              <span className="cursor-help border-b border-dotted border-text-muted/40">
                                % of content
                              </span>
                            </TooltipCard>
                          </dt>
                          <dd className="font-medium text-text-secondary">{driver.pctOfContent}</dd>
                        </div>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                          <dt className="text-text-muted/90">
                            <TooltipCard
                              title={TOOLTIPS.pillar_er_typical.title}
                              description={TOOLTIPS.pillar_er_typical.description}
                            >
                              <span className="cursor-help border-b border-dotted border-text-muted/40">ER</span>
                            </TooltipCard>
                          </dt>
                          <dd className="font-medium text-text-secondary">{driver.erTypical}</dd>
                        </div>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                          <dt className="text-text-muted/90">
                            <TooltipCard
                              title={TOOLTIPS.pillar_er_your.title}
                              description={TOOLTIPS.pillar_er_your.description}
                            >
                              <span className="cursor-help border-b border-dotted border-text-muted/40">
                                Your ER
                              </span>
                            </TooltipCard>
                          </dt>
                          <dd className="font-medium text-text-secondary">{driver.erYour}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  {displayHook ? (
                    <div className="mt-auto rounded-lg border border-nativz-border/50 bg-background/50 px-3 py-3 sm:px-3.5">
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
                        Hook you could try{clientName ? ` (${clientName})` : ''}
                      </p>
                      <p className="text-sm leading-snug text-text-secondary italic">
                        &ldquo;{displayHook}&rdquo;
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Pull quote — constrained measure so long copy stays readable on ultra-wide */}
      {pullQuote ? (
        <div className="rounded-xl border border-nativz-border bg-gradient-to-br from-surface to-surface-hover/80 p-5 sm:p-6">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:gap-6">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pink-500/10">
              <Quote size={18} className="text-pink-400/80 rotate-180" />
            </div>
            <blockquote className="min-w-0 flex-1 border-l-2 border-pink-500/25 pl-4 sm:pl-5">
              <p className="text-pretty text-base italic leading-relaxed text-text-secondary md:text-lg md:leading-relaxed">
                {pullQuote}
              </p>
            </blockquote>
          </div>
        </div>
      ) : null}
    </div>
  );
}
