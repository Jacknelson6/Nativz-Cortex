'use client';

import { useState, useMemo } from 'react';
import { Rocket, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TopicSearchVideoRow } from '@/lib/scrapers/types';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface CreatorRow {
  username: string;
  displayName: string | null;
  avatar: string | null;
  followers: number;
  avgViews: number;
  outlierRatio: number;
  videoCount: number;
}

const PER_PAGE = 5;

interface OutlierCreatorsTableProps {
  videos: TopicSearchVideoRow[];
}

export function OutlierCreatorsTable({ videos }: OutlierCreatorsTableProps) {
  const [page, setPage] = useState(0);

  const creators = useMemo(() => {
    const map = new Map<string, { videos: TopicSearchVideoRow[] }>();

    for (const v of videos) {
      const key = v.author_username ?? 'unknown';
      const entry = map.get(key);
      if (entry) {
        entry.videos.push(v);
      } else {
        map.set(key, { videos: [v] });
      }
    }

    const rows: CreatorRow[] = [];
    for (const [username, { videos: vids }] of map) {
      const first = vids[0];
      const avgViews = vids.reduce((s, v) => s + (v.views ?? 0), 0) / vids.length;
      const avgOutlier = vids.reduce((s, v) => s + (v.outlier_score ?? 0), 0) / vids.length;

      if (avgOutlier < 2) continue;

      rows.push({
        username,
        displayName: first.author_display_name,
        avatar: first.author_avatar,
        followers: first.author_followers ?? 0,
        avgViews: Math.round(avgViews),
        outlierRatio: Math.round(avgOutlier),
        videoCount: vids.length,
      });
    }

    return rows.sort((a, b) => b.outlierRatio - a.outlierRatio);
  }, [videos]);

  if (creators.length === 0) return null;

  const totalPages = Math.ceil(creators.length / PER_PAGE);
  const start = page * PER_PAGE;
  const displayed = creators.slice(start, start + PER_PAGE);

  // Stats
  const avgRatio = Math.round(creators.reduce((s, c) => s + c.outlierRatio, 0) / creators.length);
  const bestRatio = creators[0]?.outlierRatio ?? 0;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-text-primary flex items-center gap-2">
            <Rocket size={18} className="text-pink-400" />
            Outlier creators
          </h3>
          <p className="text-xs text-text-muted mt-1">
            Small creators with disproportionately viral content
          </p>
        </div>
        <span className="bg-pink-600/20 text-pink-400 text-xs font-medium px-2.5 py-1 rounded-full border border-pink-600/30">
          {creators.length} creators found
        </span>
      </div>

      {/* Outlier-specific summary (totals live in search stats above) */}
      <div className="flex gap-4">
        {[
          { label: 'Average ratio', value: `${avgRatio}x` },
          { label: 'Best ratio', value: `${bestRatio}x` },
        ].map(stat => (
          <div key={stat.label} className="rounded-lg bg-surface-hover/50 px-3 py-2 flex-1">
            <p className="text-[10px] text-text-muted">{stat.label}</p>
            <p className="text-sm font-semibold text-white mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="space-y-1">
        {displayed.map((creator, i) => {
          const rank = start + i + 1;
          const initial = (creator.username ?? 'U')[0].toUpperCase();

          return (
            <div
              key={creator.username}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-hover/40 transition-colors"
            >
              {/* Rank */}
              <span className="text-xs font-bold text-text-muted w-5 text-right shrink-0">
                {rank}
              </span>

              {/* Avatar */}
              {creator.avatar ? (
                <img
                  src={creator.avatar}
                  alt=""
                  className="h-8 w-8 rounded-full shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-pink-600/20 text-pink-400 flex items-center justify-center text-xs font-bold shrink-0">
                  {initial}
                </div>
              )}

              {/* Name */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {creator.displayName ?? creator.username}
                </p>
                <p className="text-xs text-text-muted truncate">
                  @{creator.username}
                </p>
              </div>

              {/* Followers + avg views */}
              <div className="hidden sm:block text-right shrink-0">
                <p className="text-xs text-text-muted">
                  {creator.followers > 0 ? `${formatNumber(creator.followers)} followers` : '—'}
                </p>
                <p className="text-xs text-text-muted/60">
                  {formatNumber(creator.avgViews)} avg views
                </p>
              </div>

              {/* Outlier ratio badge */}
              <span className="bg-pink-600/20 text-pink-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-pink-600/30 shrink-0">
                {creator.outlierRatio}x
              </span>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-text-muted">
            Showing {start + 1}–{Math.min(start + PER_PAGE, creators.length)} of {creators.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-7 w-7 flex items-center justify-center rounded-md border border-nativz-border text-text-muted hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                className={`h-7 w-7 flex items-center justify-center rounded-md text-xs font-medium transition-colors ${
                  page === i
                    ? 'bg-pink-600/20 text-pink-400 border border-pink-600/30'
                    : 'text-text-muted hover:bg-surface-hover border border-transparent'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="h-7 w-7 flex items-center justify-center rounded-md border border-nativz-border text-text-muted hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
