'use client';

import { useMemo } from 'react';
import { Hash } from 'lucide-react';
import type { TopicSearchVideoRow } from '@/lib/scrapers/types';

const MAX_HASHTAGS = 30;

interface HashtagCloudProps {
  videos: TopicSearchVideoRow[];
}

export function HashtagCloud({ videos }: HashtagCloudProps) {
  const hashtags = useMemo(() => {
    const counts = new Map<string, number>();

    for (const v of videos) {
      if (!v.hashtags) continue;
      for (const tag of v.hashtags) {
        const normalized = tag.toLowerCase().replace(/^#/, '');
        if (!normalized) continue;
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_HASHTAGS)
      .map(([tag, count]) => ({ tag, count }));
  }, [videos]);

  if (hashtags.length === 0) return null;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
      <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
        <Hash size={18} className="text-pink-400" />
        Popular hashtags
      </h3>

      <div className="flex flex-wrap gap-2">
        {hashtags.map(({ tag, count }) => (
          <span
            key={tag}
            className="inline-flex items-center bg-pink-600/20 text-pink-400 border border-pink-600/30 rounded-full px-3 py-1 text-sm"
          >
            #{tag}
            <span className="bg-pink-600/40 text-xs ml-1.5 px-1.5 rounded-full">
              {count}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
