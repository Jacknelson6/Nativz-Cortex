'use client';

import { Target, Clock, Lightbulb, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import type { NicheInsights as NicheInsightsType } from '@/lib/types/search';

interface NicheInsightsProps {
  insights: NicheInsightsType;
}

export function NicheInsights({ insights }: NicheInsightsProps) {
  // Split competitor gaps into sentences for easier reading
  const competitorGaps = insights.competitor_gaps
    .split(/(?<=\.)\s+/)
    .filter((s) => s.trim().length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Target size={18} className="text-accent" />
            Niche insights
          </span>
        </CardTitle>
      </CardHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top performing formats */}
        <div className="rounded-lg border border-nativz-border-light p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-emerald-400" />
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Top formats</p>
          </div>
          <ul className="space-y-1.5">
            {insights.top_performing_formats.map((format, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                {format}
              </li>
            ))}
          </ul>
        </div>

        {/* Audience hooks */}
        <div className="rounded-lg border border-nativz-border-light p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={14} className="text-amber-400" />
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Audience hooks</p>
          </div>
          <ul className="space-y-1.5">
            {insights.audience_hooks.map((hook, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                {hook}
              </li>
            ))}
          </ul>
        </div>

        {/* Competitor gaps */}
        <div className="rounded-lg border border-nativz-border-light p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} className="text-purple-400" />
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Competitor gaps</p>
          </div>
          <ul className="space-y-1.5">
            {competitorGaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                {gap}
              </li>
            ))}
          </ul>
        </div>

        {/* Best posting times */}
        <div className="rounded-lg border border-nativz-border-light p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-blue-400" />
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Best posting times</p>
          </div>
          <p className="text-sm text-text-muted">{insights.best_posting_times}</p>
        </div>
      </div>
    </Card>
  );
}
