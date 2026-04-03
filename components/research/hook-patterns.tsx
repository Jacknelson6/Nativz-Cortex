'use client';

import { useState } from 'react';
import { Zap, Eye, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TopicSearchHookRow } from '@/lib/scrapers/types';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function HookCard({ hook }: { hook: TopicSearchHookRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className="w-full rounded-xl border border-nativz-border bg-surface p-4 text-left hover:border-accent/30 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary leading-snug">
            &ldquo;{hook.pattern}&rdquo;
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Zap size={11} className="text-accent2-text" />
              {hook.video_count} videos
            </span>
            <span className="flex items-center gap-1">
              <Eye size={11} />
              {formatNumber(hook.avg_views)} avg views
            </span>
            {hook.avg_outlier_score > 1 ? (
              <Badge className="bg-amber-500/10 text-amber-300 text-[10px] px-1.5 py-0 gap-0.5">
                <TrendingUp size={9} />
                {hook.avg_outlier_score.toFixed(1)}x avg outlier
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 text-text-muted/40 mt-0.5">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {expanded && hook.example_video_ids && hook.example_video_ids.length > 0 ? (
        <div className="mt-3 pt-3 border-t border-nativz-border/50">
          <p className="text-xs text-text-muted">
            Example videos: {hook.example_video_ids.length} clips use this pattern
          </p>
        </div>
      ) : null}
    </button>
  );
}

interface HookPatternsProps {
  hooks: TopicSearchHookRow[];
}

export function HookPatterns({ hooks }: HookPatternsProps) {
  if (hooks.length === 0) return null;

  return (
    <Card className="space-y-3">
      <div>
        <CardTitle className="text-base font-semibold text-text-primary flex items-center gap-2">
          <Zap size={16} className="text-accent2-text" />
          Hook patterns
        </CardTitle>
        <p className="text-xs text-text-muted mt-1">
          Recurring opening hooks from top-performing videos
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {hooks.map(hook => (
          <HookCard key={hook.id} hook={hook} />
        ))}
      </div>
    </Card>
  );
}
