'use client';

import { Flame, Quote } from 'lucide-react';
import type { TopicSearchAIResponse, ContentBreakdownItem, TrendingTopic } from '@/lib/types/search';

interface AiTakeawaysProps {
  aiResponse: TopicSearchAIResponse | null;
  summary: string | null;
  clientName?: string | null;
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

const ACCENT_RING_COLORS = [
  'ring-pink-500/30',
  'ring-blue-500/30',
  'ring-amber-500/30',
  'ring-emerald-500/30',
] as const;

const ACCENT_BG_COLORS = [
  'bg-pink-600/15',
  'bg-blue-600/15',
  'bg-amber-600/15',
  'bg-emerald-600/15',
] as const;

const ACCENT_TEXT_COLORS = [
  'text-pink-400',
  'text-blue-400',
  'text-amber-400',
  'text-emerald-400',
] as const;

export function AiTakeaways({ aiResponse, summary, clientName }: AiTakeawaysProps) {
  if (!aiResponse && !summary) return null;

  const topics = (aiResponse?.trending_topics ?? []) as TrendingTopic[];

  const engagementDrivers: { title: string; description: string; hook: string | null }[] = (() => {
    const breakdown = aiResponse?.content_breakdown;
    const usedHooks = new Set<string>();

    if (breakdown?.categories?.length) {
      return breakdown.categories.slice(0, 4).map((c) => ({
        title: c.name,
        description: `${c.percentage}% of content · ${c.engagement_rate.toFixed(1)}% engagement rate`,
        hook: pickHookForCategory(c, topics, usedHooks),
      }));
    }

    if (topics.length) {
      return topics.slice(0, 4).map((t) => {
        const firstHook = t.video_ideas?.[0]?.hook ?? null;
        return {
          title: t.name,
          description: t.posts_overview ?? '',
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
      {/* What is driving engagement — full-width: 4-up on xl, 2-up on md, stacks on mobile */}
      {engagementDrivers.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-1 border-b border-nativz-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div>
              <h4 className="text-base font-semibold tracking-tight text-text-primary">
                What is driving engagement
              </h4>
              <p className="mt-1 text-xs text-text-muted max-w-2xl">
                Short-form patterns pulling views in this topic — pair each angle with a hook for your next posts.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4 2xl:gap-5">
            {engagementDrivers.map((driver, i) => {
              const accentIdx = i % ACCENT_RING_COLORS.length;
              const displayHook = driver.hook ? cleanHookQuotes(driver.hook) : null;

              return (
                <div
                  key={i}
                  className={`group relative flex h-full min-h-0 flex-col rounded-xl border border-nativz-border bg-surface p-4 ring-1 ${ACCENT_RING_COLORS[accentIdx]} transition-all hover:ring-2`}
                >
                  <div className="mb-3 flex items-start gap-2.5">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ACCENT_BG_COLORS[accentIdx]}`}
                    >
                      <Flame size={14} className={ACCENT_TEXT_COLORS[accentIdx]} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-text-primary line-clamp-3">
                        {driver.title}
                      </p>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted tabular-nums">
                        {driver.description}
                      </p>
                    </div>
                  </div>
                  {displayHook ? (
                    <div className="mt-auto rounded-lg border border-nativz-border/50 bg-background/50 px-3 py-2.5">
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                        Example hook{clientName ? ` for ${clientName}` : ''}
                      </p>
                      <p className="text-[13px] leading-snug text-text-secondary italic">
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
              <p className="text-pretty text-sm italic leading-relaxed text-text-secondary md:text-[15px] md:leading-relaxed">
                {pullQuote}
              </p>
            </blockquote>
          </div>
        </div>
      ) : null}
    </div>
  );
}
