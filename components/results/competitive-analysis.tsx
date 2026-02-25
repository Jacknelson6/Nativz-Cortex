'use client';

import { Swords, TrendingUp, AlertTriangle, Sparkles } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import type { NicheInsights } from '@/lib/types/search';

interface CompetitiveAnalysisProps {
  nicheInsights: NicheInsights;
}

export function CompetitiveAnalysis({ nicheInsights }: CompetitiveAnalysisProps) {
  return (
    <Card>
      <div className="flex items-center gap-2.5 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
          <Swords size={16} className="text-orange-400" />
        </div>
        <CardTitle className="!mb-0">Competitive analysis</CardTitle>
      </div>

      <div className="space-y-5">
        {/* Competitor gaps */}
        {nicheInsights.competitor_gaps && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-amber-400" />
              <h4 className="text-sm font-semibold text-amber-400">Competitor gap</h4>
            </div>
            <p className="text-sm text-text-secondary">{nicheInsights.competitor_gaps}</p>
          </div>
        )}

        {/* Top formats */}
        {nicheInsights.top_performing_formats && nicheInsights.top_performing_formats.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <TrendingUp size={14} className="text-emerald-400" />
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Top performing formats</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {nicheInsights.top_performing_formats.map((format, i) => (
                <span
                  key={i}
                  className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
                >
                  {format}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Audience hooks */}
        {nicheInsights.audience_hooks && nicheInsights.audience_hooks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Sparkles size={14} className="text-purple-400" />
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Audience hooks</h4>
            </div>
            <div className="space-y-1.5">
              {nicheInsights.audience_hooks.map((hook, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                  <span className="text-purple-400 mt-0.5">•</span>
                  <span>{hook}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Best posting times */}
        {nicheInsights.best_posting_times && (
          <div className="rounded-lg bg-surface-hover p-3">
            <p className="text-xs text-text-muted mb-1">Best posting times</p>
            <p className="text-sm font-medium text-text-primary">{nicheInsights.best_posting_times}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
