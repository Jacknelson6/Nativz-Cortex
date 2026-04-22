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

  // Icon accents intentionally muted — per .impeccable.md ("accents work
  // BECAUSE they're rare; overuse kills their power"), the numeric value
  // is the visual punch on a stats card. The previous mix (pink-400 /
  // emerald-400 / purple-400) read as decoration and pulled focus from
  // the actual metrics. One cyan accent on the hero stat (Views) keeps
  // the brand color rare and meaningful.
  const stats = [
    { label: 'Videos', value: formatNumber(videos.length), icon: Camera, accent: 'text-text-muted' },
    { label: 'Views', value: formatNumber(totalViews), icon: Eye, accent: 'text-accent-text' },
    { label: 'Avg views', value: formatNumber(avgViews), icon: BarChart3, accent: 'text-text-muted' },
    { label: 'Creators', value: formatNumber(uniqueAuthors), icon: Users, accent: 'text-text-muted' },
    { label: 'Hashtags', value: formatNumber(allHashtags.size), icon: Hash, accent: 'text-text-muted' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="group flex items-center gap-3 rounded-xl border border-nativz-border bg-surface p-3 transition-all duration-200 hover:-translate-y-px hover:border-nativz-border/90 hover:bg-surface-hover/30"
        >
          <s.icon size={16} className={s.accent} />
          <div className="min-w-0">
            <p className="text-lg font-semibold tabular-nums leading-tight text-text-primary">{s.value}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/85">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
