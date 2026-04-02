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
  categories: 'Content pillars',
};

export function ContentBreakdown({ data }: ContentBreakdownProps) {
  const [activeTab, setActiveTab] = useState<Tab>('intentions');

  const items = data[activeTab];
  if (!items || items.length === 0) return null;

  return (
    <Card>
      <CardTitle className="text-2xl">Content breakdown</CardTitle>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 rounded-lg bg-surface-hover p-1">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
          const tooltip = TOOLTIPS[tab];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-md px-3 py-2.5 text-base font-medium transition-all ${
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
      <div className="mt-5 space-y-4">
        {items.map((item: ContentBreakdownItem) => (
          <div key={item.name}>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="text-lg text-text-secondary leading-snug">{item.name}</span>
              <span className="text-base font-semibold text-text-muted tabular-nums shrink-0">
                {item.percentage}%
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-hover overflow-hidden">
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
