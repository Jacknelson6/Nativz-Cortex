'use client';

import { Target, Clock, Lightbulb, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { NicheInsights as NicheInsightsType } from '@/lib/types/search';

interface NicheInsightsProps {
  insights: NicheInsightsType;
}

export function NicheInsights({ insights }: NicheInsightsProps) {
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
      <div className="space-y-5">
        {/* Top performing formats */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-text-muted" />
            <p className="text-sm font-medium text-text-secondary">Top performing formats</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {insights.top_performing_formats.map((format, i) => (
              <Badge key={i}>{format}</Badge>
            ))}
          </div>
        </div>

        {/* Audience hooks */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={14} className="text-text-muted" />
            <p className="text-sm font-medium text-text-secondary">Audience hooks</p>
          </div>
          <ul className="space-y-1.5">
            {insights.audience_hooks.map((hook, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {hook}
              </li>
            ))}
          </ul>
        </div>

        {/* Competitor gaps */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Target size={14} className="text-text-muted" />
            <p className="text-sm font-medium text-text-secondary">Competitor gaps</p>
          </div>
          <p className="text-sm text-text-muted rounded-lg bg-accent-surface/50 px-3 py-2">
            {insights.competitor_gaps}
          </p>
        </div>

        {/* Best posting times */}
        <div className="flex items-start gap-2 text-sm text-text-muted">
          <Clock size={14} className="mt-0.5 shrink-0" />
          <p>{insights.best_posting_times}</p>
        </div>
      </div>
    </Card>
  );
}
