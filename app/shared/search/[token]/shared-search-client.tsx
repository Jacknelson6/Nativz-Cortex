'use client';

import { Building2, Clock, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { MetricsRow } from '@/components/results/metrics-row';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { ContentPillars } from '@/components/results/content-pillars';
import { NicheInsights } from '@/components/results/niche-insights';
import { SourcesPanel } from '@/components/results/sources-panel';
import { KeyFindings } from '@/components/results/key-findings';
import { SentimentBadge } from '@/components/results/sentiment-badge';
import { ActivityChart } from '@/components/charts/activity-chart';
import { formatRelativeTime } from '@/lib/utils/format';
import { hasSerp } from '@/lib/types/search';
import type { TopicSearch, TopicSearchAIResponse, TrendingTopic } from '@/lib/types/search';

interface SharedSearchClientProps {
  search: TopicSearch;
  clientName: string | null;
}

export function SharedSearchClient({ search, clientName }: SharedSearchClientProps) {
  const aiResponse = search.raw_ai_response as TopicSearchAIResponse | null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl flex h-14 items-center gap-4 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-surface">
            <Search size={14} className="text-accent-text" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-text-primary">{search.query}</span>
            {clientName && (
              <>
                <span className="text-text-muted">·</span>
                <span className="flex items-center gap-1 text-text-muted">
                  <Building2 size={12} />
                  {clientName}
                </span>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {aiResponse?.overall_sentiment !== undefined && (
              <SentimentBadge sentiment={aiResponse.overall_sentiment} />
            )}
            {search.completed_at && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-text-muted">
                <Clock size={12} />
                {formatRelativeTime(search.completed_at)}
              </span>
            )}
            <Badge variant="info">Shared report</Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {aiResponse?.brand_alignment_notes ? (
          <ExecutiveSummary summary={aiResponse.brand_alignment_notes} variant="brand" />
        ) : (
          search.summary && <ExecutiveSummary summary={search.summary} />
        )}

        {search.summary && aiResponse?.trending_topics && (
          <KeyFindings summary={search.summary} topics={aiResponse.trending_topics} />
        )}

        {search.metrics && <MetricsRow metrics={search.metrics} isBrandSearch={!!aiResponse?.brand_alignment_notes} />}

        {search.activity_data && search.activity_data.length > 0 && (
          <ActivityChart data={search.activity_data} />
        )}

        {(search.emotions || search.content_breakdown) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {search.emotions && search.emotions.length > 0 && (
              <EmotionsBreakdown emotions={search.emotions} />
            )}
            {search.content_breakdown && (
              <ContentBreakdown data={search.content_breakdown} />
            )}
          </div>
        )}

        {search.trending_topics && search.trending_topics.length > 0 && (
          <TrendingTopicsTable topics={search.trending_topics} searchId={search.id} />
        )}

        {(aiResponse?.content_pillars || aiResponse?.niche_performance_insights) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {aiResponse.content_pillars && aiResponse.content_pillars.length > 0 && (
              <ContentPillars pillars={aiResponse.content_pillars} />
            )}
            {aiResponse.niche_performance_insights && (
              <NicheInsights insights={aiResponse.niche_performance_insights} />
            )}
          </div>
        )}

        {hasSerp(search) && search.serp_data && (
          <SourcesPanel serpData={search.serp_data} />
        )}
      </div>

      <ScrollToTop />

      {/* Footer */}
      <div className="border-t border-nativz-border py-6 text-center">
        <p className="text-xs text-text-muted">
          Powered by <span className="font-medium text-text-secondary">Nativz Cortex</span>
        </p>
      </div>
    </div>
  );
}
