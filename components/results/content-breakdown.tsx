'use client';

import { useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { TOOLTIPS } from '@/lib/tooltips';
import type { ContentBreakdown as ContentBreakdownType, ContentBreakdownItem } from '@/lib/types/search';

interface ContentBreakdownProps {
  data: ContentBreakdownType;
}

type Tab = 'intentions' | 'categories';

const TAB_LABELS: Record<Tab, string> = {
  intentions: 'Why people watch',
  categories: 'Categories',
};

export function ContentBreakdown({ data }: ContentBreakdownProps) {
  const [activeTab, setActiveTab] = useState<Tab>('intentions');

  const items = data[activeTab];
  if (!items || items.length === 0) return null;

  return (
    <Card>
      <CardTitle>Content breakdown</CardTitle>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-lg bg-surface-hover p-1">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
          const tooltip = TOOLTIPS[tab];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                activeTab === tab
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tooltip ? (
                <TooltipCard title={tooltip.title} description={tooltip.description}>
                  {TAB_LABELS[tab]}
                </TooltipCard>
              ) : (
                TAB_LABELS[tab]
              )}
            </button>
          );
        })}
      </div>

      {/* Items */}
      <div className="mt-4 space-y-3">
        {items.map((item: ContentBreakdownItem) => (
          <div key={item.name}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm text-text-secondary">{item.name}</span>
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-medium text-text-muted tabular-nums">{item.percentage}%</span>
                <span className="text-xs text-text-muted tabular-nums">
                  {(item.engagement_rate * 100).toFixed(1)}% ER
                </span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${item.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
