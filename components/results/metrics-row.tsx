'use client';

import { StatCard } from '@/components/shared/stat-card';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { Globe, MessageCircle, Video, Activity, Heart, Eye, Users, TrendingUp } from 'lucide-react';
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
            tooltipKey: 'web_sources',
            title: 'Web sources',
            value: String(metrics.web_results_found),
            icon: <Globe size={18} />,
          },
          {
            tooltipKey: 'discussions',
            title: 'Discussions',
            value: String(metrics.discussions_found),
            subtitle: metrics.total_discussion_replies !== null ? `${formatNumber(metrics.total_discussion_replies)} replies` : undefined,
            icon: <MessageCircle size={18} />,
          },
          {
            tooltipKey: 'videos',
            title: 'Videos',
            value: String(metrics.videos_found),
            subtitle: metrics.total_video_views !== null ? `${formatNumber(metrics.total_video_views)} views` : undefined,
            icon: <Video size={18} />,
          },
          {
            tooltipKey: 'sentiment',
            title: 'Sentiment',
            value: getSentimentLabel(metrics.overall_sentiment),
            subtitle: INTENSITY_LABELS[metrics.conversation_intensity] ? `${INTENSITY_LABELS[metrics.conversation_intensity]} intensity` : undefined,
            icon: <Activity size={18} />,
          },
        ].map((card, i) => (
          <div key={card.tooltipKey} className="animate-stagger-in" style={{ animationDelay: `${i * 50}ms` }}>
            <StatCard
              title={
                <TooltipCard title={TOOLTIPS[card.tooltipKey].title} description={TOOLTIPS[card.tooltipKey].description}>
                  {card.title}
                </TooltipCard>
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
