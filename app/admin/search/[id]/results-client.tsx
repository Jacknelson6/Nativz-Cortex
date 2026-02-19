'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Clock, CheckCircle, XCircle, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExecutiveSummary } from '@/components/reports/executive-summary';
import { MetricsRow } from '@/components/results/metrics-row';
import { ActivityChart } from '@/components/charts/activity-chart';
import { EmotionsBreakdown } from '@/components/results/emotions-breakdown';
import { ContentBreakdown } from '@/components/results/content-breakdown';
import { TrendingTopicsTable } from '@/components/results/trending-topics-table';
import { formatRelativeTime } from '@/lib/utils/format';
import type { TopicSearch } from '@/lib/types/search';

interface AdminResultsClientProps {
  search: TopicSearch;
  clientInfo?: { id: string; name: string; slug: string } | null;
}

export function AdminResultsClient({ search, clientInfo }: AdminResultsClientProps) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);

  async function handleApproval(action: 'approve' | 'reject') {
    setApproving(true);
    try {
      const res = await fetch(`/api/search/${search.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        toast.success(action === 'approve' ? 'Search approved' : 'Approval revoked');
        router.refresh();
      } else {
        toast.error(`Failed to ${action} search. Try again.`);
      }
    } finally {
      setApproving(false);
    }
  }

  if (search.status === 'processing' || search.status === 'pending') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center">
        <Loader2 size={32} className="animate-spin text-indigo-600 mb-4" />
        <p className="text-sm text-gray-600">Researching &ldquo;{search.query}&rdquo;...</p>
        <p className="mt-1 text-xs text-gray-400">This usually takes 30-60 seconds</p>
      </div>
    );
  }

  if (search.status === 'failed') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4">
        <p className="text-sm text-red-600 mb-4">{search.summary || 'Search failed. Try again.'}</p>
        <Link href="/admin/search/new">
          <Button variant="outline">New search</Button>
        </Link>
      </div>
    );
  }

  const approveLabel = clientInfo
    ? `Approve for ${clientInfo.name}`
    : 'Approve';

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-4 px-6">
          <Link href="/admin/search/history" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-900">{search.query}</span>
            <span className="text-gray-300">/</span>
            <span className="text-gray-500">Results</span>
            {clientInfo && (
              <>
                <span className="text-gray-300">/</span>
                <Link
                  href={`/admin/clients/${clientInfo.slug}`}
                  className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  <Building2 size={12} />
                  {clientInfo.name}
                </Link>
              </>
            )}
            {!clientInfo && search.client_id === null && (
              <>
                <span className="text-gray-300">/</span>
                <span className="text-xs text-gray-400">No client attached</span>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {search.completed_at && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400">
                <Clock size={12} />
                {formatRelativeTime(search.completed_at)}
              </span>
            )}
            {search.approved_at ? (
              <>
                <Badge variant="success">Approved</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApproval('reject')}
                  disabled={approving}
                >
                  <XCircle size={14} />
                  Revoke
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => handleApproval('approve')}
                disabled={approving}
              >
                <CheckCircle size={14} />
                {approving ? 'Approving...' : approveLabel}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {search.summary && <ExecutiveSummary summary={search.summary} />}
        {search.metrics && <MetricsRow metrics={search.metrics} />}
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
      </div>
    </div>
  );
}
