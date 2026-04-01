'use client';

import { Building2, Clock, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { BrandApplication } from '@/components/reports/brand-application';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { ContentPillars } from '@/components/results/content-pillars';
import { NicheInsights } from '@/components/results/niche-insights';
import { SourcesPanel } from '@/components/results/sources-panel';
import { TopicSyntheticAudiences } from '@/components/results/topic-synthetic-audiences';
import { SentimentBadge } from '@/components/results/sentiment-badge';
import { ActivityChart } from '@/components/charts/activity-chart';
import { formatRelativeTime } from '@/lib/utils/format';
import {
  getClientAbbreviationLabel,
  searchHeaderClientClassName,
  searchHeaderQueryClassName,
} from '@/lib/clients/client-abbreviations';
import { hasSerp } from '@/lib/types/search';
import type { TopicSearch, TopicSearchAIResponse } from '@/lib/types/search';
import { ScrapedVideosSection } from '@/components/results/scraped-videos-section';

interface SharedSearchClientProps {
  search: TopicSearch;
  clientName: string | null;
  clientSlug?: string | null;
  shareToken: string;
  scrapedVideoCount?: number;
}

export function SharedSearchClient({
  search,
  clientName,
  clientSlug = null,
  shareToken,
  scrapedVideoCount = 0,
}: SharedSearchClientProps) {
  const aiResponse = search.raw_ai_response as TopicSearchAIResponse | null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
        <div className="flex w-full flex-col gap-3 px-6 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface">
              <Search size={14} className="text-accent-text" />
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className={searchHeaderQueryClassName}>{search.query}</span>
              {clientName && (
                <>
                  <span className="shrink-0 text-text-muted">·</span>
                  <span
                    title={clientName}
                    className={`inline-flex min-w-0 items-center gap-1 text-text-muted ${searchHeaderClientClassName}`}
                  >
                    <Building2 size={12} className="shrink-0" />
                    {getClientAbbreviationLabel(clientName, clientSlug)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
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
      <div className="w-full px-6 py-8 space-y-6">
        {search.summary ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10 lg:items-start">
              <ExecutiveSummary summary={search.summary} />
              <BrandApplication
                content={aiResponse?.brand_alignment_notes}
                clientName={clientName}
              />
            </div>
          </div>
        ) : null}

        {aiResponse?.synthetic_audiences?.segments?.length ? (
          <TopicSyntheticAudiences data={aiResponse.synthetic_audiences} />
        ) : null}

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

        <ScrapedVideosSection
          searchId={search.id}
          scrapedVideoCount={scrapedVideoCount}
          shareToken={shareToken}
          webContext={((search as { pipeline_state?: { web_context?: unknown } }).pipeline_state?.web_context ?? null) as never}
        />

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
