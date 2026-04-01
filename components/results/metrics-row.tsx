'use client';

import type { ReactNode } from 'react';
import { StatCard } from '@/components/shared/stat-card';
import { PlatformIcon } from '@/components/search/platform-icon';
import { Zap, TrendingUp, Heart, Eye, Users, MessageCircle, Globe } from 'lucide-react';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { formatNumber } from '@/lib/utils/format';
import { TOOLTIPS } from '@/lib/tooltips';
import type { SearchMetrics, LegacySearchMetrics, PlatformBreakdown } from '@/lib/types/search';
import { isNewMetrics } from '@/lib/types/search';

interface MetricsRowProps {
  metrics: SearchMetrics | LegacySearchMetrics;
  /** When present, shown inside the Sources analyzed card (topic searches only). */
  platformBreakdown?: PlatformBreakdown[];
}

function SourcesPlatformFooter({ breakdown }: { breakdown: PlatformBreakdown[] }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-text-muted">Sources gathered</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {breakdown.map((pb) => (
          <span key={pb.platform} className="flex items-center gap-1.5 text-sm">
            <PlatformIcon platform={pb.platform} size={14} />
            <span className="font-medium text-text-secondary tabular-nums">{pb.post_count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MetricsRow({ metrics, platformBreakdown }: MetricsRowProps) {
  if (isNewMetrics(metrics)) {
    const cards: {
      tooltipKey: 'topic_score' | 'sources_analyzed';
      title: string;
      value: string;
      icon: ReactNode;
      footer?: ReactNode;
    }[] = [
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
        footer:
          platformBreakdown && platformBreakdown.length > 0 ? (
            <SourcesPlatformFooter breakdown={platformBreakdown} />
          ) : undefined,
      },
    ];

    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        {cards.map((card, i) => {
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
                footer={card.footer}
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
