'use client';

import { StatCard } from '@/components/shared/stat-card';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { Zap, Lightbulb, TrendingUp, Activity, Heart, Eye, Users, MessageCircle } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import { getSentimentLabel } from '@/lib/utils/sentiment';
import { TOOLTIPS } from '@/lib/tooltips';
import type { SearchMetrics, LegacySearchMetrics } from '@/lib/types/search';
import { isNewMetrics } from '@/lib/types/search';

interface MetricsRowProps {
  metrics: SearchMetrics | LegacySearchMetrics;
}

const INTENSITY_LABELS: Record<string, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very high',
};

export function MetricsRow({ metrics }: MetricsRowProps) {
  if (isNewMetrics(metrics)) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            tooltipKey: 'topic_score',
            title: 'Topic score',
            value: String(metrics.topic_score ?? 0),
            subtitle: `${metrics.sources_analyzed ?? metrics.total_sources} sources analyzed`,
            icon: <Zap size={18} />,
          },
          {
            tooltipKey: 'sentiment',
            title: 'Audience sentiment',
            value: getSentimentLabel(metrics.overall_sentiment),
            subtitle: INTENSITY_LABELS[metrics.conversation_intensity] ? `${INTENSITY_LABELS[metrics.conversation_intensity]} intensity` : undefined,
            icon: <Activity size={18} />,
          },
          {
            tooltipKey: 'content_opportunities',
            title: 'Video ideas',
            value: String(metrics.content_opportunities ?? 0),
            subtitle: 'Ready-to-film concepts',
            icon: <Lightbulb size={18} />,
          },
          {
            tooltipKey: 'trending_topics',
            title: 'Trending angles',
            value: String(metrics.trending_topics_count ?? 0),
            subtitle: metrics.total_video_views ? `${formatNumber(metrics.total_video_views)} video views` : undefined,
            icon: <TrendingUp size={18} />,
          },
        ].map((card, i) => (
          <div key={card.tooltipKey} className="animate-stagger-in" style={{ animationDelay: `${i * 50}ms` }}>
            <StatCard
              title={
                TOOLTIPS[card.tooltipKey] ? (
                  <TooltipCard title={TOOLTIPS[card.tooltipKey].title} description={TOOLTIPS[card.tooltipKey].description}>
                    {card.title}
                  </TooltipCard>
                ) : card.title
              }
              value={card.value}
              subtitle={card.subtitle}
              icon={card.icon}
            />
          </div>
        ))}
      </div>
    );
  }

  // Legacy metrics fallback for old searches
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {[
        { title: 'Engagements', value: formatNumber(metrics.total_engagements), icon: <Heart size={18} /> },
        { title: 'Engagement rate', value: `${(metrics.engagement_rate * 100).toFixed(1)}%`, icon: <TrendingUp size={18} /> },
        { title: 'Est. views', value: formatNumber(metrics.estimated_views), icon: <Eye size={18} /> },
        { title: 'Est. reach', value: formatNumber(metrics.estimated_reach), icon: <Users size={18} /> },
        { title: 'Mentions', value: formatNumber(metrics.total_mentions), icon: <MessageCircle size={18} /> },
      ].map((card, i) => (
        <div key={card.title} className="animate-stagger-in" style={{ animationDelay: `${i * 50}ms` }}>
          <StatCard title={card.title} value={card.value} icon={card.icon} />
        </div>
      ))}
    </div>
  );
}
