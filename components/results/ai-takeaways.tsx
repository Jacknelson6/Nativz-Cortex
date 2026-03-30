'use client';

import { Sparkles, Flame, CheckCircle2 } from 'lucide-react';
import type { TopicSearchAIResponse } from '@/lib/types/search';

interface AiTakeawaysProps {
  aiResponse: TopicSearchAIResponse | null;
  summary: string | null;
}

export function AiTakeaways({ aiResponse, summary }: AiTakeawaysProps) {
  if (!aiResponse && !summary) return null;

  // Key insight: first key finding sentence, or summary first sentence
  const keyInsight = (() => {
    const findings = aiResponse?.trending_topics?.[0]?.posts_overview;
    if (findings) return findings;
    if (summary) {
      const firstSentence = summary.split(/[.!?]\s/)[0];
      return firstSentence ? firstSentence + '.' : summary;
    }
    return null;
  })();

  // Engagement drivers: content breakdown categories or trending topics top 4
  const engagementDrivers: { title: string; description: string }[] = (() => {
    const breakdown = aiResponse?.content_breakdown;
    if (breakdown?.categories?.length) {
      return breakdown.categories.slice(0, 4).map((c) => ({
        title: c.name,
        description: `${c.percentage}% of content, ${c.engagement_rate.toFixed(1)}% engagement rate`,
      }));
    }
    const topics = aiResponse?.trending_topics;
    if (topics?.length) {
      return topics.slice(0, 4).map((t) => ({
        title: t.name,
        description: t.posts_overview ?? '',
      }));
    }
    return [];
  })();

  // Pull quote
  const pullQuote = aiResponse?.brand_alignment_notes
    ?? (aiResponse?.conversation_themes?.[0]?.representative_quotes?.[0])
    ?? null;

  // What is working: action items or key findings from topics
  const workingItems: string[] = (() => {
    const topics = aiResponse?.trending_topics;
    if (topics?.length) {
      return topics.slice(0, 5).map((t) => {
        const ideas = t.video_ideas?.[0];
        return ideas?.why_it_works ?? t.comments_overview ?? t.name;
      });
    }
    if (summary) {
      return summary.split(/[.!?]\s/).filter(Boolean).slice(0, 5).map((s) => s.trim() + '.');
    }
    return [];
  })();

  return (
    <div className="space-y-5">
      {/* Key insight */}
      {keyInsight ? (
        <div className="rounded-xl border border-nativz-border bg-surface/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-yellow-400" />
            <h4 className="text-sm font-bold text-text-primary">Key insight</h4>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">{keyInsight}</p>
        </div>
      ) : null}

      {/* What is driving engagement */}
      {engagementDrivers.length > 0 ? (
        <div>
          <h4 className="text-sm font-bold text-text-primary mb-3">What is driving engagement</h4>
          <div className="space-y-2">
            {engagementDrivers.map((driver, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-nativz-border bg-surface p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-600/15">
                  <Flame size={14} className="text-pink-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-primary">{driver.title}</p>
                  <p className="text-xs text-text-muted mt-0.5">{driver.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Pull quote */}
      {pullQuote ? (
        <div className="border-l-4 border-pink-600 pl-4 py-2">
          <p className="text-sm italic leading-relaxed text-text-secondary">&ldquo;{pullQuote}&rdquo;</p>
        </div>
      ) : null}

      {/* What is working */}
      {workingItems.length > 0 ? (
        <div>
          <h4 className="text-sm font-bold text-text-primary mb-3">What is working</h4>
          <ul className="space-y-2">
            {workingItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-text-secondary">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-text-muted" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
