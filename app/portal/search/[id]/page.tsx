import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, ClockIcon } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { MetricsRow } from '@/components/results/metrics-row';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { ContentPillars } from '@/components/results/content-pillars';
import { NicheInsights } from '@/components/results/niche-insights';
import { SourcesPanel } from '@/components/results/sources-panel';
import { ActivityChart } from '@/components/charts/activity-chart';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { formatRelativeTime } from '@/lib/utils/format';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { hasSerp } from '@/lib/types/search';
import type { TopicSearch, TopicSearchAIResponse } from '@/lib/types/search';

export default async function PortalSearchResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPortalClient();

  if (!result) return null;

  const adminClient = createAdminClient();

  const { data: search, error } = await adminClient
    .from('topic_searches')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !search) {
    notFound();
  }

  // Verify org scoping: search's client must belong to user's org
  if (search.client_id) {
    const { data: clientData } = await adminClient
      .from('clients')
      .select('id, organization_id')
      .eq('id', search.client_id)
      .single();

    if (!clientData || clientData.organization_id !== result.organizationId) {
      notFound();
    }
  } else {
    // No client attached — portal users shouldn't see unattached searches
    notFound();
  }

  // If not approved, show pending state
  if (!search.approved_at) {
    return (
      <div className="min-h-full">
        <div className="sticky top-0 z-10 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
          <div className="flex h-14 items-center gap-4 px-6">
            <Link href="/portal/reports" className="text-text-muted hover:text-text-secondary transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-text-primary">{search.query}</span>
              <span className="text-text-muted">/</span>
              <span className="text-text-muted">Report</span>
            </div>
            <div className="ml-auto">
              <Badge variant="warning">Pending review</Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center px-6 py-24">
          <Card className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
              <ClockIcon size={24} className="text-amber-400" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">Pending approval</h2>
            <p className="mt-2 text-sm text-text-muted">
              This report is being reviewed by your Nativz team. You&apos;ll be able to view it once approved.
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

  const s = search as TopicSearch;
  const aiResponse = s.raw_ai_response as TopicSearchAIResponse | null;

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-4 px-6">
          <Link href="/portal/reports" className="text-text-muted hover:text-text-secondary transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-text-primary">{s.query}</span>
            <span className="text-text-muted">/</span>
            <span className="text-text-muted">Report</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {s.completed_at && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-text-muted">
                <Clock size={12} />
                {formatRelativeTime(s.completed_at)}
              </span>
            )}
            <Badge variant="success">Approved</Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Brand alignment note — shown for client strategy searches */}
        {aiResponse?.brand_alignment_notes && (
          <div className="rounded-xl border border-accent/20 bg-accent-surface/30 px-5 py-4">
            <p className="text-sm font-medium text-accent-text mb-1">Brand alignment</p>
            <p className="text-sm text-text-secondary">{aiResponse.brand_alignment_notes}</p>
          </div>
        )}

        {s.summary && <ExecutiveSummary summary={s.summary} />}
        {s.metrics && <MetricsRow metrics={s.metrics} />}

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
          <TrendingTopicsTable topics={s.trending_topics} />
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

        {/* Sources panel — only for new searches with SERP data */}
        {hasSerp(s) && s.serp_data && (
          <SourcesPanel serpData={s.serp_data} />
        )}
      </div>

      <ScrollToTop />
    </div>
  );
}
