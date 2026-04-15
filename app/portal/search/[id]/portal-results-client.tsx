'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, ClockIcon, FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { ScrollProgress } from '@/components/ui/scroll-progress';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { BrandApplication } from '@/components/reports/brand-application';
import { AiTakeaways } from '@/components/results/ai-takeaways';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { ContentPillars } from '@/components/results/content-pillars';
import { NicheInsights } from '@/components/results/niche-insights';
import { SourcesPanel } from '@/components/results/sources-panel';
import { SourceBrowser } from '@/components/results/source-browser';
import { ActivityChart } from '@/components/charts/activity-chart';
import { BigMovers } from '@/components/results/big-movers';
import { CompetitiveAnalysis } from '@/components/results/competitive-analysis';
import { TopicSyntheticAudiences } from '@/components/results/topic-synthetic-audiences';
import { ScrapedVideosSection } from '@/components/results/scraped-videos-section';
import { contentLabTopicSearchStorageKey } from '@/lib/content-lab/topic-search-selection-storage';
import { formatRelativeTime } from '@/lib/utils/format';
import { searchHeaderQueryClassName } from '@/lib/clients/client-abbreviations';
import { hasSerp } from '@/lib/types/search';
import type { TopicSearch, TopicSearchAIResponse, TrendingTopic, LegacyTrendingTopic, PlatformSource } from '@/lib/types/search';

interface PortalClientInfo {
  id: string;
  name: string;
  slug: string;
  industry?: string;
  topic_keywords?: string[] | null;
}

interface PortalResultsClientProps {
  search: TopicSearch;
  clientName: string | null;
  scrapedVideoCount: number;
  clientInfo?: PortalClientInfo | null;
  /** Portal-side feature flag mirror. When false, the "Open in Content Lab"
   *  button is hidden even if a clientId is available. */
  canUseContentLab?: boolean;
}

export function PortalResultsClient({
  search,
  clientName,
  scrapedVideoCount,
  clientInfo,
  canUseContentLab = false,
}: PortalResultsClientProps) {
  const router = useRouter();
  const aiResponse = search.raw_ai_response as TopicSearchAIResponse | null;
  const trendingTopics = (search.trending_topics ?? []) as (TrendingTopic | LegacyTrendingTopic)[];

  function openInContentLab() {
    if (!clientInfo) return;
    // Pre-pin this search so Content Lab auto-attaches it on mount.
    // Mirrors the admin "Open in Content Lab" flow — same storage key,
    // read by PortalContentLab.
    try {
      const key = contentLabTopicSearchStorageKey(clientInfo.id);
      window.localStorage.setItem(key, JSON.stringify([search.id]));
    } catch {
      /* quota / JSON — non-fatal, lab still opens without the chip */
    }
    router.push(`/portal/content-lab/${clientInfo.id}`);
  }

  const hasPlatformSources = Boolean(
    search.platform_data && (search.platform_data as Record<string, unknown>).sources,
  );

  return (
    <div className="min-h-full">
      <ScrollProgress />
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
        <div className="flex flex-col gap-3 px-6 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Link
              href="/portal/search/new"
              className="mt-0.5 shrink-0 text-text-muted hover:text-text-secondary transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className={searchHeaderQueryClassName}>{search.query}</span>
              <span className="shrink-0 text-text-muted">/</span>
              <span className="shrink-0 text-text-muted">Report</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            {search.completed_at && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-text-muted">
                <Clock size={12} />
                {formatRelativeTime(search.completed_at)}
              </span>
            )}
            {canUseContentLab && clientInfo ? (
              <button
                type="button"
                onClick={openInContentLab}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent-text transition-colors hover:border-accent/60 hover:bg-accent/20"
                title={`Open this search in Content Lab with ${clientInfo.name}`}
              >
                <FlaskConical size={14} aria-hidden />
                Open in Content Lab
              </button>
            ) : null}
            <Badge variant="success">Report ready</Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full px-6 py-8 space-y-6 sm:space-y-8">
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

        {(aiResponse || search.summary) ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-4 sm:p-5">
            <AiTakeaways
              aiResponse={aiResponse}
              summary={search.summary}
              clientName={clientName}
              hasAttachedClient={!!search.client_id}
            />
          </div>
        ) : null}

        {/* Scraped videos — outlier board, video grid, hook patterns */}
        <ScrapedVideosSection
          searchId={search.id}
          scrapedVideoCount={scrapedVideoCount}
          webContext={((search as { pipeline_state?: { web_context?: unknown } }).pipeline_state?.web_context ?? null) as never}
          defaultClientId={search.client_id}
          clientName={clientName}
          enableInlineVideoAnalysis={false}
        />

        {aiResponse?.synthetic_audiences?.segments?.length ? (
          <TopicSyntheticAudiences data={aiResponse.synthetic_audiences} />
        ) : null}

        {/* Legacy activity chart — only for old searches */}
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

        {trendingTopics.length > 0 ? (
          <TrendingTopicsTable topics={trendingTopics} clientId={search.client_id} searchId={search.id} />
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

        {/* Competitive analysis (brand search) */}
        {Boolean(aiResponse?.niche_performance_insights && aiResponse?.brand_alignment_notes) ? (
          <CompetitiveAnalysis nicheInsights={aiResponse!.niche_performance_insights!} />
        ) : null}

        {/* Big movers — who's making noise in this space */}
        {Boolean(aiResponse?.big_movers?.length) ? (
          <BigMovers movers={aiResponse!.big_movers!} />
        ) : null}

        {/* Source browser — browse short-form video posts by platform.
            Analyze actions are hidden for portal viewers because the
            /api/analysis/items topic_search_id path is admin-only. */}
        {hasPlatformSources ? (
          <SourceBrowser
            sources={(search.platform_data as Record<string, unknown>).sources as PlatformSource[]}
            searchId={search.id}
            searchQuery={search.query}
            clientContext={
              clientInfo
                ? {
                    name: clientInfo.name,
                    industry: clientInfo.industry,
                    topicKeywords: clientInfo.topic_keywords ?? undefined,
                  }
                : null
            }
            defaultClientId={search.client_id}
          />
        ) : null}

        {/* Sources panel — only for new searches with SERP data */}
        {hasSerp(search) && search.serp_data ? (
          <SourcesPanel serpData={search.serp_data} />
        ) : null}
      </div>

      <ScrollToTop />
    </div>
  );
}

// ─── Pending state (not yet approved by admin) ────────────────────────────────

export function PortalResultsPending({ query }: { query: string }) {
  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-10 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
        <div className="flex flex-col gap-3 px-6 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Link
              href="/portal/search/new"
              className="mt-0.5 shrink-0 text-text-muted hover:text-text-secondary transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className={searchHeaderQueryClassName}>{query}</span>
              <span className="shrink-0 text-text-muted">/</span>
              <span className="shrink-0 text-text-muted">Report</span>
            </div>
          </div>
          <div className="shrink-0">
            <Badge variant="warning">Coming soon</Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center px-6 py-24">
        <Card className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
            <ClockIcon size={24} className="text-amber-400" />
          </div>
          <h2 className="text-base font-semibold text-text-primary">Report coming soon</h2>
          <p className="mt-2 text-sm text-text-muted">
            Your team is preparing this report. You&apos;ll be able to view it once it&apos;s ready.
          </p>
          <div className="mt-6">
            <Link href="/portal/reports">
              <Button variant="outline">
                <ArrowLeft size={16} />
                Back to reports
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
