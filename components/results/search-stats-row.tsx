'use client';

import { Camera, Eye, BarChart3, Users, Hash } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import type { TopicSearchVideoRow } from '@/lib/scrapers/types';

interface SearchStatsRowProps {
  videos: TopicSearchVideoRow[];
}

export function SearchStatsRow({ videos }: SearchStatsRowProps) {
  if (videos.length === 0) return null;

  const totalViews = videos.reduce((s, v) => s + (v.views ?? 0), 0);
  const avgViews = Math.round(totalViews / videos.length);

  const uniqueAuthors = new Set(videos.map((v) => v.author_username).filter(Boolean)).size;

  const allHashtags = new Set<string>();
  for (const v of videos) {
    if (v.hashtags) {
      for (const h of v.hashtags) allHashtags.add(h.toLowerCase());
    }
  }

  const stats = [
    { label: 'Videos', value: formatNumber(videos.length), icon: Camera, accent: 'text-pink-400' },
    { label: 'Views', value: formatNumber(totalViews), icon: Eye, accent: 'text-text-muted' },
    { label: 'Avg views', value: formatNumber(avgViews), icon: BarChart3, accent: 'text-emerald-400' },
    { label: 'Creators', value: formatNumber(uniqueAuthors), icon: Users, accent: 'text-purple-400' },
    { label: 'Hashtags', value: formatNumber(allHashtags.size), icon: Hash, accent: 'text-text-muted' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-nativz-border bg-surface p-3 flex items-center gap-3"
        >
          <s.icon size={16} className={s.accent} />
          <div className="min-w-0">
            <p className="text-lg font-bold text-text-primary leading-tight">{s.value}</p>
            <p className="text-xs text-text-muted">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
