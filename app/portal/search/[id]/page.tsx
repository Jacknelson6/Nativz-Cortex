import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, ClockIcon } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { MetricsRow } from '@/components/results/metrics-row';
import { ActivityChart } from '@/components/charts/activity-chart';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { formatRelativeTime } from '@/lib/utils/format';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import type { TopicSearch } from '@/lib/types/search';

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
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
          <div className="flex h-14 items-center gap-4 px-6">
            <Link href="/portal/reports" className="text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-gray-900">{search.query}</span>
              <span className="text-gray-300">/</span>
              <span className="text-gray-500">Report</span>
            </div>
            <div className="ml-auto">
              <Badge variant="warning">Pending review</Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center px-6 py-24">
          <Card className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
              <ClockIcon size={24} className="text-amber-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Pending approval</h2>
            <p className="mt-2 text-sm text-gray-500">
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

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-4 px-6">
          <Link href="/portal/reports" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-900">{s.query}</span>
            <span className="text-gray-300">/</span>
            <span className="text-gray-500">Report</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {s.completed_at && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400">
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
        {s.summary && <ExecutiveSummary summary={s.summary} />}
        {s.metrics && <MetricsRow metrics={s.metrics} />}
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
      </div>
    </div>
  );
}
