'use client';

import { StatCard } from '@/components/shared/stat-card';
import { Zap, Lightbulb, TrendingUp, Heart, Eye, Users, MessageCircle, Building2, Globe } from 'lucide-react';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { formatNumber } from '@/lib/utils/format';
import { TOOLTIPS } from '@/lib/tooltips';
import type { SearchMetrics, LegacySearchMetrics } from '@/lib/types/search';
import { isNewMetrics } from '@/lib/types/search';

interface MetricsRowProps {
  metrics: SearchMetrics | LegacySearchMetrics;
  isBrandSearch?: boolean;
}

export function MetricsRow({ metrics, isBrandSearch = false }: MetricsRowProps) {
  if (isNewMetrics(metrics)) {
    const cards = isBrandSearch
      ? [
          {
            tooltipKey: 'brand_references',
            title: 'Brand references',
            value: String(metrics.total_sources ?? 0),
            icon: <Building2 size={18} />,
          },
          {
            tooltipKey: 'discussions',
            title: 'Conversations',
            value: String(metrics.discussions_found ?? 0),
            icon: <MessageCircle size={18} />,
          },
        ]
      : [
          {
            tooltipKey: 'topic_score',
            title: 'Topic score',
            value: String(metrics.topic_score ?? 0),
            icon: <Zap size={18} />,
          },
          {
            tooltipKey: 'sources_analyzed',
            title: 'Sources analyzed',
            value: String(metrics.sources_analyzed ?? metrics.total_sources),
            icon: <Globe size={18} />,
          },
        ];

    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ...cards,
          {
            tooltipKey: 'content_opportunities',
            title: 'Video ideas',
            value: String(metrics.content_opportunities ?? 0),
            icon: <Lightbulb size={18} />,
          },
          {
            tooltipKey: 'trending_topics',
            title: 'Trending angles',
            value: String(metrics.trending_topics_count ?? 0),
            icon: <TrendingUp size={18} />,
          },
        ].map((card, i) => {
          const tooltip = TOOLTIPS[card.tooltipKey];
          return (
            <div key={card.tooltipKey} className="animate-stagger-in" style={{ animationDelay: `${i * 50}ms` }}>
              <StatCard
                title={
                  tooltip ? (
                    <TooltipCard title={tooltip.title} description={tooltip.description}>
                      {card.title}
                    </TooltipCard>
                  ) : (
                    card.title
                  )
                }
                value={card.value}
                icon={card.icon}
              />
            </div>
          );
        })}
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
        <div key={String(card.title)} className="animate-stagger-in" style={{ animationDelay: `${i * 50}ms` }}>
          <StatCard title={card.title} value={card.value} icon={card.icon} />
        </div>
      ))}
    </div>
  );
}
