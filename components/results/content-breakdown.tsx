'use client';

import { useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import type { ContentBreakdown as ContentBreakdownType, ContentBreakdownItem } from '@/lib/types/search';

interface ContentBreakdownProps {
  data: ContentBreakdownType;
}

type Tab = 'intentions' | 'categories' | 'formats';

const TAB_LABELS: Record<Tab, string> = {
  intentions: 'Intentions',
  categories: 'Categories',
  formats: 'Formats',
};

export function ContentBreakdown({ data }: ContentBreakdownProps) {
  const [activeTab, setActiveTab] = useState<Tab>('intentions');

  const items = data[activeTab];
  if (!items || items.length === 0) return null;

  return (
    <Card>
      <CardTitle>Content breakdown</CardTitle>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-lg bg-gray-100 p-1">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="mt-4 space-y-3">
        {items.map((item: ContentBreakdownItem) => (
          <div key={item.name} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm text-gray-600">{item.name}</span>
            <div className="flex-1 h-5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${item.percentage}%` }}
              />
            </div>
            <span className="w-10 text-right text-xs font-medium text-gray-700">
              {item.percentage}%
            </span>
            <span className="w-14 text-right text-xs text-gray-400">
              {(item.engagement_rate * 100).toFixed(1)}% ER
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
