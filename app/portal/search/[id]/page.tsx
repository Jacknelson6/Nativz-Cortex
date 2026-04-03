import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Clock, ClockIcon } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { BrandApplication } from '@/components/reports/brand-application';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { ContentPillars } from '@/components/results/content-pillars';
import { NicheInsights } from '@/components/results/niche-insights';
import { SourcesPanel } from '@/components/results/sources-panel';
import { TopicSyntheticAudiences } from '@/components/results/topic-synthetic-audiences';
import { ActivityChart } from '@/components/charts/activity-chart';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { ScrollProgress } from '@/components/ui/scroll-progress';
import { formatRelativeTime } from '@/lib/utils/format';
import { searchHeaderQueryClassName } from '@/lib/clients/client-abbreviations';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { hasSerp } from '@/lib/types/search';
import type { TopicSearch, TopicSearchAIResponse } from '@/lib/types/search';
import { ScrapedVideosSection } from '@/components/results/scraped-videos-section';

export default async function PortalSearchResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPortalClient();

  if (!result) return null;

  // BUG 5: Enforce can_view_reports feature flag
  if (!result.client.feature_flags?.can_view_reports) notFound();

  const adminClient = createAdminClient();

  const { data: search, error } = await adminClient
    .from('topic_searches')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !search) {
    notFound();
  }

  // BUG 3: Verify client ownership — search must belong to the user's specific client
  if (!search.client_id || search.client_id !== result.client.id) {
    notFound();
  }

  // Verify org scoping: search's client must belong to user's org
  const { data: clientData } = await adminClient
    .from('clients')
    .select('id, organization_id')
    .eq('id', search.client_id)
    .single();

  if (!clientData || clientData.organization_id !== result.organizationId) {
    notFound();
  }

  if (search.status === 'processing' || search.status === 'pending') {
    redirect(`/portal/search/${id}/processing`);
  }

  // If not approved, show pending state
  if (!search.approved_at) {
    return (
      <div className="min-h-full">
        <div className="sticky top-0 z-10 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
          <div className="flex flex-col gap-3 px-6 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Link
                href="/portal/reports"
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
              Your Nativz team is preparing this report. You&apos;ll be able to view it once it&apos;s ready.
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

  // Fetch scraped video count for v3 sections
  const { count: scrapedVideoCount } = await adminClient
    .from('topic_search_videos')
    .select('id', { count: 'exact', head: true })
    .eq('search_id', id);

  const s = search as TopicSearch;
  const aiResponse = s.raw_ai_response as TopicSearchAIResponse | null;

  const { data: clientNameRow } = await adminClient
    .from('clients')
    .select('name')
    .eq('id', s.client_id as string)
    .single();
  const portalClientName = clientNameRow?.name ?? null;

  return (
    <div className="min-h-full">
      <ScrollProgress />
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
        <div className="flex flex-col gap-3 px-6 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Link
              href="/portal/reports"
              className="mt-0.5 shrink-0 text-text-muted hover:text-text-secondary transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className={searchHeaderQueryClassName}>{s.query}</span>
              <span className="shrink-0 text-text-muted">/</span>
              <span className="shrink-0 text-text-muted">Report</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            {s.completed_at && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-text-muted">
                <Clock size={12} />
                {formatRelativeTime(s.completed_at)}
              </span>
            )}
            <Badge variant="success">Report ready</Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full px-6 py-8 space-y-6">
        {s.summary ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10 lg:items-start">
              <ExecutiveSummary summary={s.summary} />
              <BrandApplication
                content={aiResponse?.brand_alignment_notes}
                clientName={portalClientName}
              />
            </div>
          </div>
        ) : null}
        {aiResponse?.synthetic_audiences?.segments?.length ? (
          <TopicSyntheticAudiences data={aiResponse.synthetic_audiences} />
        ) : null}

        {/* Legacy activity chart — only rendered for old searches */}
        {s.activity_data && s.activity_data.length > 0 && (
          <ActivityChart data={s.activity_data} />
        )}

        {(s.emotions || s.content_breakdown) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {s.emotions && s.emotions.length > 0 && (
              <EmotionsBreakdown emotions={s.emotions} />
            )}
            {s.content_breakdown && (
              <ContentBreakdown data={s.content_breakdown} />
            )}
          </div>
        )}
        {s.trending_topics && s.trending_topics.length > 0 && (
          <TrendingTopicsTable topics={s.trending_topics} clientId={search.client_id} searchId={s.id} />
        )}

        {/* Client strategy sections */}
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

        {/* Scraped videos v3 sections */}
        <ScrapedVideosSection
          searchId={s.id}
          scrapedVideoCount={scrapedVideoCount ?? 0}
          webContext={((s as { pipeline_state?: { web_context?: unknown } }).pipeline_state?.web_context ?? null) as never}
          defaultClientId={s.client_id}
          clientName={portalClientName}
          enableInlineVideoAnalysis={false}
        />

        {/* Sources panel — only for new searches with SERP data */}
        {hasSerp(s) && s.serp_data && (
          <SourcesPanel serpData={s.serp_data} />
        )}
      </div>

      <ScrollToTop />
    </div>
  );
}
