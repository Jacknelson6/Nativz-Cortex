'use client';

import { Building2, Clock, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { ScrollProgress } from '@/components/ui/scroll-progress';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { BrandApplication } from '@/components/reports/brand-application';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { ContentPillars } from '@/components/results/content-pillars';
import { NicheInsights } from '@/components/results/niche-insights';
import { SourcesPanel } from '@/components/results/sources-panel';
import { WebSearchSummaryCard } from '@/components/results/web-search-summary-card';
import { RedditScanSummaryCard } from '@/components/results/reddit-scan-summary-card';
import { TopicSyntheticAudiences } from '@/components/results/topic-synthetic-audiences';
import { SentimentBadge } from '@/components/results/sentiment-badge';
import { ActivityChart } from '@/components/charts/activity-chart';
import { AiTakeaways } from '@/components/results/ai-takeaways';
import { SourceBrowser } from '@/components/results/source-browser';
import type { PlatformSource } from '@/lib/types/search';
import { formatRelativeTime } from '@/lib/utils/format';
import {
  getClientAbbreviationLabel,
  searchHeaderClientClassName,
  searchHeaderQueryClassName,
} from '@/lib/clients/client-abbreviations';
import { hasSerp } from '@/lib/types/search';
import type { TopicSearch, TopicSearchAIResponse } from '@/lib/types/search';
import { ScrapedVideosSection } from '@/components/results/scraped-videos-section';
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';

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
  const { brandName } = useAgencyBrand();
  const aiResponse = search.raw_ai_response as TopicSearchAIResponse | null;

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
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

      {/* Content — matches admin results page (minus Strategy Lab) */}
      <div className="w-full px-6 py-8 space-y-6 sm:space-y-8">
        {search.summary ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10 lg:items-start">
              <ExecutiveSummary summary={search.summary} />
              <BrandApplication
                content={aiResponse?.brand_alignment_notes}
                clientName={clientName}
              />
            </div>
          </div>
        ) : null}

        {/* AI takeaways — content pillars + recommendations */}
        {(aiResponse || search.summary) ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-5 sm:p-6">
            <AiTakeaways
              aiResponse={aiResponse}
              summary={search.summary}
              clientName={clientName}
              hasAttachedClient={!!clientName}
            />
          </div>
        ) : null}

        {/* Scraped videos — outlier board, video grid, hook patterns */}
        <ScrapedVideosSection
          searchId={search.id}
          scrapedVideoCount={scrapedVideoCount}
          shareToken={shareToken}
          webContext={((search as { pipeline_state?: { web_context?: unknown } }).pipeline_state?.web_context ?? null) as never}
          enableInlineVideoAnalysis={false}
        />

        {aiResponse?.synthetic_audiences?.segments?.length ? (
          <TopicSyntheticAudiences data={aiResponse.synthetic_audiences} />
        ) : null}

        {search.activity_data && search.activity_data.length > 0 ? (
          <ActivityChart data={search.activity_data} />
        ) : null}

        {(Boolean(search.emotions?.length) || Boolean(search.content_breakdown)) ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {search.emotions && search.emotions.length > 0 ? (
              <EmotionsBreakdown emotions={search.emotions} />
            ) : null}
            {search.content_breakdown ? (
              <ContentBreakdown data={search.content_breakdown} />
            ) : null}
          </div>
        ) : null}

        {search.trending_topics && search.trending_topics.length > 0 ? (
          <TrendingTopicsTable topics={search.trending_topics} searchId={search.id} />
        ) : null}

        {Boolean(aiResponse) &&
        ((aiResponse!.content_pillars?.length ?? 0) > 0 || Boolean(aiResponse!.niche_performance_insights)) ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {(aiResponse!.content_pillars?.length ?? 0) > 0 && aiResponse!.content_pillars ? (
              <ContentPillars pillars={aiResponse!.content_pillars} />
            ) : null}
            {aiResponse!.niche_performance_insights ? (
              <NicheInsights insights={aiResponse!.niche_performance_insights} />
            ) : null}
          </div>
        ) : null}

        {(() => {
          const platformSources = ((search.platform_data as Record<string, unknown> | null)?.sources ?? []) as PlatformSource[];
          const hasPlatformSources = platformSources.length > 0;
          const redditSources = platformSources.filter((s) => s.platform === 'reddit');
          const serpData = hasSerp(search) ? search.serp_data : null;
          const hasWebResults = Boolean(serpData?.webResults?.length);
          const hasSummaryCards = hasWebResults || redditSources.length > 0;

          return (
            <>
              {hasSummaryCards ? (
                <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
                  {hasWebResults && serpData ? (
                    <WebSearchSummaryCard
                      query={search.query}
                      completedAt={search.completed_at}
                      serpData={serpData}
                    />
                  ) : null}
                  {redditSources.length > 0 ? (
                    <RedditScanSummaryCard
                      redditSources={redditSources}
                      completedAt={search.completed_at}
                    />
                  ) : null}
                </div>
              ) : null}

              {hasPlatformSources ? (
                <SourceBrowser
                  sources={platformSources}
                  searchId={search.id}
                  searchQuery={search.query}
                  clientContext={clientName ? { name: clientName } : null}
                  defaultClientId={search.client_id}
                />
              ) : null}

              {serpData ? <SourcesPanel serpData={serpData} /> : null}
            </>
          );
        })()}
      </div>

      <ScrollToTop />

      {/* Footer */}
      <div className="border-t border-nativz-border py-6 text-center">
        <p className="text-xs text-text-muted">
          Powered by <span className="font-medium text-text-secondary">{brandName} Cortex</span>
        </p>
      </div>
    </div>
  );
}
