'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { SummaryReport, TopPostItem } from '@/lib/types/reporting';
import type { ReportSections } from '@/lib/pdf/report-template';

interface ReportData {
  clientName: string;
  agency: string | null;
  logoUrl: string | null;
  dateRange: { start: string; end: string };
  sections: ReportSections;
  summary: SummaryReport | null;
  topPosts: TopPostItem[];
}

export default function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [token, setToken] = useState('');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    async function fetchReport() {
      try {
        const res = await fetch(`/api/reporting/shared/${token}`);
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error ?? 'Failed to load report');
        }
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [token]);

  async function handleDownload() {
    if (!data) return;
    setExporting(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { ReportPdfDocument } = await import('@/lib/pdf/report-template');

      const blob = await pdf(
        ReportPdfDocument({
          clientName: data.clientName,
          agency: data.agency,
          logoUrl: data.logoUrl,
          dateRange: data.dateRange,
          summary: data.summary,
          topPosts: data.topPosts,
          sections: data.sections,
        }),
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.clientName.replace(/[^a-zA-Z0-9]/g, '_')}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-text border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="ui-section-title">
            {error ?? 'Report not found'}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            This report link may have expired.
          </p>
        </div>
      </div>
    );
  }

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const combined = data.summary?.combined;
  const platforms = data.summary?.platforms ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="ui-page-title-md">
            Performance report
          </h1>
          <p className="text-sm text-text-secondary">{data.clientName}</p>
          <p className="text-xs text-text-muted mt-1">
            {data.dateRange.start} — {data.dateRange.end}
          </p>
        </div>

        {/* Download button */}
        <div className="mb-6">
          <Button onClick={handleDownload} disabled={exporting}>
            {exporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileDown size={14} />
            )}
            {exporting ? 'Generating...' : 'Download PDF'}
          </Button>
        </div>

        {/* Performance summary */}
        {data.sections.performanceSummary && combined && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-text-primary mb-3">
              Performance summary
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: 'Total views',
                  value: formatNumber(combined.totalViews ?? 0),
                  change: combined.totalViewsChange ?? 0,
                },
                {
                  label: 'Followers gained',
                  value: formatNumber(combined.totalFollowerChange ?? 0),
                  change: combined.totalFollowerChangeChange ?? 0,
                },
                {
                  label: 'Engagement',
                  value: formatNumber(combined.totalEngagement ?? 0),
                  change: combined.totalEngagementChange ?? 0,
                },
                {
                  label: 'Avg rate',
                  value: `${(combined.avgEngagementRate ?? 0).toFixed(2)}%`,
                  change: combined.avgEngagementRateChange ?? 0,
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-nativz-border bg-surface p-4"
                >
                  <p className="text-xs text-text-muted">{m.label}</p>
                  <p className="text-lg font-semibold text-text-primary mt-1">
                    {m.value}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${m.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                  >
                    {m.change >= 0 ? '+' : ''}
                    {formatNumber(m.change)} vs prev
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Platform breakdown */}
        {data.sections.platformBreakdown && platforms.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-text-primary mb-3">
              Platform breakdown
            </h2>
            <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-nativz-border">
                    <th className="px-4 py-2 text-left text-text-muted text-xs font-medium">
                      Platform
                    </th>
                    <th className="px-4 py-2 text-right text-text-muted text-xs font-medium">
                      Followers
                    </th>
                    <th className="px-4 py-2 text-right text-text-muted text-xs font-medium">
                      Views
                    </th>
                    <th className="px-4 py-2 text-right text-text-muted text-xs font-medium">
                      Engagement
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {platforms.map((p) => (
                    <tr
                      key={p.platform}
                      className="border-b border-nativz-border last:border-b-0"
                    >
                      <td className="px-4 py-2 text-text-primary capitalize">
                        {p.platform}
                      </td>
                      <td className="px-4 py-2 text-right text-text-primary">
                        {formatNumber(p.followers ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-right text-text-primary">
                        {formatNumber(p.totalViews ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-right text-text-primary">
                        {formatNumber(p.totalEngagement ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top posts */}
        {data.sections.topPosts && data.topPosts.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-text-primary mb-3">
              Top {data.topPosts.length} posts
            </h2>
            <div className="space-y-3">
              {data.topPosts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-xl border border-nativz-border bg-surface p-4 flex items-start gap-3"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white text-xs font-bold shrink-0">
                    {post.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-muted capitalize">
                      {post.platform}
                    </p>
                    <p className="text-sm text-text-secondary line-clamp-2 mt-0.5">
                      {post.caption ?? 'No caption'}
                    </p>
                    <div className="flex gap-4 mt-2 text-xs text-text-muted">
                      <span>{formatNumber(post.views ?? 0)} views</span>
                      <span>{formatNumber(post.likes ?? 0)} likes</span>
                      <span>
                        {formatNumber(post.comments ?? 0)} comments
                      </span>
                      <span>{formatNumber(post.shares ?? 0)} shares</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-nativz-border pt-4 mt-8">
          <p className="text-xs text-text-muted text-center">
            Prepared by {data?.agency?.toLowerCase().includes('anderson') ? 'Anderson Collaborative' : 'Nativz'}
          </p>
        </div>
      </div>
    </div>
  );
}
