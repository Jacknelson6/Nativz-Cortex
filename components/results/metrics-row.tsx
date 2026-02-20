'use client';

import { useState, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { StatCard } from '@/components/shared/stat-card';
import { Zap, Lightbulb, TrendingUp, Heart, Eye, Users, MessageCircle, Building2, Globe } from 'lucide-react';
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
        ].map((card, i) => (
          <div key={card.tooltipKey} className="animate-stagger-in" style={{ animationDelay: `${i * 50}ms` }}>
            <MetricTooltipWrapper tooltip={TOOLTIPS[card.tooltipKey]}>
              <StatCard
                title={card.title}
                value={card.value}
                icon={card.icon}
              />
            </MetricTooltipWrapper>
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

// ─── Whole-card tooltip wrapper ──────────────────────────────────────────────

function MetricTooltipWrapper({
  tooltip,
  children,
}: {
  tooltip?: { title: string; description: string };
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0, above: false });
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const show = useCallback((e: React.MouseEvent) => {
    if (!tooltip) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.left + rect.width / 2 - 128; // center the 256px tooltip
    const clampedX = Math.max(8, Math.min(x, window.innerWidth - 272));
    const below = rect.bottom + 8;
    const above = below + 100 > window.innerHeight;
    setPosition({ x: clampedX, y: above ? rect.top - 8 : below, above });
    timeoutRef.current = setTimeout(() => setVisible(true), 300);
  }, [tooltip]);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  if (!tooltip) return <>{children}</>;

  return (
    <div
      onMouseEnter={show}
      onMouseLeave={hide}
      className="h-full"
    >
      {children}
      {visible && typeof document !== 'undefined' && createPortal(
        <div
          className="animate-tooltip-in pointer-events-none fixed z-50 w-64 rounded-lg border border-nativz-border bg-surface p-3 shadow-elevated"
          style={{
            left: position.x,
            ...(position.above
              ? { bottom: window.innerHeight - position.y }
              : { top: position.y }),
          }}
        >
          <p className="text-xs font-semibold text-text-primary mb-1">{tooltip.title}</p>
          <p className="text-xs text-text-muted leading-relaxed">{tooltip.description}</p>
        </div>,
        document.body
      )}
    </div>
  );
}
