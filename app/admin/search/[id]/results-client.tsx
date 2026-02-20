'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Clock, Send, Undo2, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { MetricsRow } from '@/components/results/metrics-row';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { ContentPillars } from '@/components/results/content-pillars';
import { NicheInsights } from '@/components/results/niche-insights';
import { SourcesPanel } from '@/components/results/sources-panel';
import { ActivityChart } from '@/components/charts/activity-chart';
import { SearchProgress } from '@/components/search/search-progress';
import { formatRelativeTime } from '@/lib/utils/format';
import { hasSerp } from '@/lib/types/search';
import type { TopicSearch, TopicSearchAIResponse } from '@/lib/types/search';

interface AdminResultsClientProps {
  search: TopicSearch;
  clientInfo?: { id: string; name: string; slug: string } | null;
}

export function AdminResultsClient({ search, clientInfo }: AdminResultsClientProps) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const aiResponse = search.raw_ai_response as TopicSearchAIResponse | null;

  async function handleSend(action: 'approve' | 'reject') {
    setSending(true);
    try {
      const res = await fetch(`/api/search/${search.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const name = clientInfo?.name;
        toast.success(
          action === 'approve'
            ? `Report sent to ${name || 'client'}`
            : 'Report unsent'
        );
        router.refresh();
      } else {
        toast.error('Something went wrong. Try again.');
      }
    } finally {
      setSending(false);
    }
  }

  if (search.status === 'processing' || search.status === 'pending') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4">
        <p className="text-lg font-semibold text-text-primary mb-2">
          Researching &ldquo;{search.query}&rdquo;
        </p>
        <p className="text-sm text-text-muted mb-8">This usually takes 1-2 minutes</p>
        <SearchProgress />
      </div>
    );
  }

  if (search.status === 'failed') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4">
        <p className="text-sm text-red-400 mb-4">{search.summary || 'Search failed. Try again.'}</p>
        <Link href="/admin/search/new">
          <Button variant="outline">New search</Button>
        </Link>
      </div>
    );
  }

  const sendLabel = clientInfo
    ? `Send to ${clientInfo.name}`
    : 'Send to client';

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-nativz-border bg-surface/80 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-4 px-6">
          <Link href="/admin/search/history" className="text-text-muted hover:text-text-secondary transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-text-primary">{search.query}</span>
            <span className="text-text-muted">/</span>
            <span className="text-text-muted">Results</span>
            {clientInfo && (
              <>
                <span className="text-text-muted">/</span>
                <Link
                  href={`/admin/clients/${clientInfo.slug}`}
                  className="flex items-center gap-1 text-accent-text hover:text-accent-hover transition-colors"
                >
                  <Building2 size={12} />
                  {clientInfo.name}
                </Link>
              </>
            )}
            {!clientInfo && search.client_id === null && (
              <>
                <span className="text-text-muted">/</span>
                <span className="text-xs text-text-muted">No client attached</span>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {search.completed_at && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-text-muted">
                <Clock size={12} />
                {formatRelativeTime(search.completed_at)}
              </span>
            )}
            {search.approved_at ? (
              <>
                <Badge variant="success">Sent</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSend('reject')}
                  disabled={sending}
                >
                  <Undo2 size={14} />
                  Unsend
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => handleSend('approve')}
                disabled={sending}
              >
                <Send size={14} />
                {sending ? 'Sending...' : sendLabel}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Brand alignment replaces executive summary for brand searches */}
        {aiResponse?.brand_alignment_notes ? (
          <ExecutiveSummary summary={aiResponse.brand_alignment_notes} variant="brand" />
        ) : (
          search.summary && <ExecutiveSummary summary={search.summary} />
        )}
        {search.metrics && <MetricsRow metrics={search.metrics} />}

        {/* Legacy activity chart — only rendered for old searches */}
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
          <TrendingTopicsTable topics={search.trending_topics} />
        )}

        {/* Client strategy sections — only for client_strategy searches */}
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
        {hasSerp(search) && search.serp_data && (
          <SourcesPanel serpData={search.serp_data} />
        )}
      </div>

      <ScrollToTop />
    </div>
  );
}
