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

  const pullQuote = aiResponse?.brand_alignment_notes
    ?? (aiResponse?.conversation_themes?.[0]?.representative_quotes?.[0])
    ?? null;

  return (
    <div className="space-y-5">
      {/* What is driving engagement — bento grid */}
      {engagementDrivers.length > 0 ? (
        <div>
          <h4 className="text-sm font-bold text-text-primary mb-3">What is driving engagement</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {engagementDrivers.map((driver, i) => {
              const accentIdx = i % ACCENT_RING_COLORS.length;
              const displayHook = driver.hook ? cleanHookQuotes(driver.hook) : null;

              return (
                <div
                  key={i}
                  className={`group relative rounded-xl border border-nativz-border bg-surface p-4 ring-1 ${ACCENT_RING_COLORS[accentIdx]} transition-all hover:ring-2`}
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${ACCENT_BG_COLORS[accentIdx]}`}>
                      <Flame size={13} className={ACCENT_TEXT_COLORS[accentIdx]} />
                    </div>
                    <p className="text-sm font-semibold text-text-primary leading-tight">{driver.title}</p>
                  </div>
                  <p className="text-[11px] text-text-muted mb-3 tabular-nums">{driver.description}</p>
                  {displayHook ? (
                    <div className="rounded-lg bg-background/60 border border-nativz-border/50 px-3 py-2.5">
                      <p className="text-xs font-medium text-text-muted mb-1 uppercase tracking-wider">
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

      {/* Pull quote */}
      {pullQuote ? (
        <div className="flex gap-3 rounded-xl border border-nativz-border bg-surface/50 p-4">
          <Quote size={16} className="mt-0.5 shrink-0 text-pink-400/60 rotate-180" />
          <p className="text-sm italic leading-relaxed text-text-secondary">{pullQuote}</p>
        </div>
      ) : null}

    </div>
  );
}
