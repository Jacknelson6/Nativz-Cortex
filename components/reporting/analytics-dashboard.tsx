'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw, Download, Flame, Users } from 'lucide-react';
import { ComboSelect } from '@/components/ui/combo-select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportingData } from './hooks/use-reporting-data';
import { DateRangePicker } from './date-range-picker';
import { SummaryView } from './summary-view';
import { PlatformSection } from './platform-section';
import { TopPostsView } from './top-posts-view';
import { AudienceInsightsCard } from './audience-insights-card';
import { PlatformBreakdownTable } from './platform-breakdown-table';
import { PostingCadenceHeatmap } from './posting-cadence-heatmap';
import { PostDetailsGrid } from './post-details-grid';
import { DemographicsCard } from './demographics-card';
import { BestTimeHeatmap } from './best-time-heatmap';
import { GoogleBusinessCard } from './google-business-card';
import type { TopPostItem } from '@/lib/types/reporting';

const ReportBuilder = dynamic(() => import('./report-builder').then(m => ({ default: m.ReportBuilder })));

export function AnalyticsDashboard({ initialClientId }: { initialClientId?: string | null } = {}) {
  const {
    clients,
    selectedClient,
    selectedClientId,
    setSelectedClientId,
    datePreset,
    setDatePreset,
    customRange,
    setCustomRange,
    dateRange,
    summary,
    loading,
    dataLoading,
    syncing,
    syncNow,
    fetchTopPostsForReport,
  } = useReportingData(initialClientId);

  const [reportOpen, setReportOpen] = useState(false);
  const [showDemographics, setShowDemographics] = useState(false);

  // Top-performers fetch lives here so the panel is always under the summary,
  // independent of whatever tab the rest of the dashboard is on.
  const [topPosts, setTopPosts] = useState<TopPostItem[]>([]);
  const [topPostsLoading, setTopPostsLoading] = useState(false);
  const [topPostsLimit, setTopPostsLimit] = useState(5);

  useEffect(() => {
    if (!selectedClientId || !dateRange) return;
    setTopPostsLoading(true);
    const params = new URLSearchParams({
      clientId: selectedClientId,
      start: dateRange.start,
      end: dateRange.end,
      limit: String(topPostsLimit),
    });
    fetch(`/api/reporting/top-posts?${params}`)
      .then((res) => (res.ok ? res.json() : { posts: [] }))
      .then((data) => setTopPosts(data.posts ?? []))
      .catch(() => setTopPosts([]))
      .finally(() => setTopPostsLoading(false));
  }, [selectedClientId, dateRange?.start, dateRange?.end, topPostsLimit]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-64">
          <ComboSelect
            label="Client"
            options={clientOptions}
            value={selectedClientId}
            onChange={setSelectedClientId}
            placeholder="Select a client…"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={syncNow}
          disabled={syncing || !selectedClientId}
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          Sync now
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setReportOpen(true)}
          disabled={!selectedClientId}
        >
          <Download size={14} />
          Download report
        </Button>
      </div>

      {!selectedClientId ? (
        <p className="text-center text-text-muted py-16">
          Select a client to view reporting data
        </p>
      ) : (
        <>
          {/* Date range selector */}
          <div className="flex items-center gap-3">
            <DateRangePicker
              value={datePreset}
              onChange={setDatePreset}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
            />
            {dateRange && (
              <span className="text-sm text-text-muted">
                {new Date(dateRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' – '}
                {new Date(dateRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>

          {/* Aggregate summary cards */}
          <SummaryView data={summary} loading={dataLoading} />

          {/* Top performers — always visible under the summary. */}
          <div className="space-y-4 rounded-xl border border-nativz-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-orange-400" />
              <h2 className="text-base font-semibold text-text-primary">Top performing posts</h2>
            </div>
            <TopPostsView
              posts={topPosts}
              loading={topPostsLoading}
              limit={topPostsLimit}
              onLimitChange={setTopPostsLimit}
            />
          </div>

          {/* Platform breakdown + posting cadence — side by side on lg+. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {summary?.platformBreakdown && summary.platformBreakdown.length > 0 && (
              <PlatformBreakdownTable rows={summary.platformBreakdown} />
            )}
            {selectedClientId && dateRange && (
              <PostingCadenceHeatmap
                clientId={selectedClientId}
                start={dateRange.start}
                end={dateRange.end}
              />
            )}
          </div>

          {/* Best time to post — Zernio's historical engagement heatmap. */}
          {selectedClientId && <BestTimeHeatmap clientId={selectedClientId} />}

          {/* Google Business Profile — renders a connect-CTA empty state
              when the client has no GMB account linked. */}
          {selectedClientId && dateRange && (
            <GoogleBusinessCard
              clientId={selectedClientId}
              start={dateRange.start}
              end={dateRange.end}
            />
          )}

          {/* Per-platform sections */}
          {summary?.platforms && summary.platforms.length > 0 && (
            <div className="space-y-8 pt-4">
              <h2 className="text-lg font-semibold text-text-primary border-b border-nativz-border pb-2">
                Platform breakdown
              </h2>
              {(['facebook', 'instagram', 'youtube', 'tiktok', 'linkedin'] as const)
                .filter((p) => summary.platforms.some((ps) => ps.platform === p))
                .map((platform) => {
                  const ps = summary.platforms.find((s) => s.platform === platform)!;
                  const chartData = summary.platformCharts?.[platform] ?? [];
                  return (
                    <PlatformSection
                      key={platform}
                      summary={ps}
                      chartData={chartData}
                    />
                  );
                })}
            </div>
          )}

          {/* Audience insights — auto-hides when Zernio doesn't return data. */}
          {selectedClientId && <AudienceInsightsCard clientId={selectedClientId} />}

          {/* Audience demographics — behind an explicit toggle. Default off so
              the main page reads as platform performance, not audience breakdown. */}
          {selectedClientId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-text-muted" />
                  <h2 className="text-base font-semibold text-text-primary">Audience demographics</h2>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDemographics((v) => !v)}
                >
                  {showDemographics ? 'Hide' : 'Show demographics'}
                </Button>
              </div>
              {showDemographics && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <DemographicsCard clientId={selectedClientId} platform="instagram" />
                  <DemographicsCard clientId={selectedClientId} platform="youtube" />
                </div>
              )}
            </div>
          )}

          {/* Full post details grid — filterable list of every post. */}
          {selectedClientId && dateRange && (
            <PostDetailsGrid
              clientId={selectedClientId}
              start={dateRange.start}
              end={dateRange.end}
            />
          )}
        </>
      )}

      {/* Report builder modal */}
      {selectedClient && (
        <ReportBuilder
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          clientName={selectedClient.name}
          clientId={selectedClient.id}
          agency={selectedClient.agency}
          logoUrl={selectedClient.logo_url}
          dateRange={dateRange}
          summary={summary}
          fetchTopPostsForReport={fetchTopPostsForReport}
        />
      )}
    </div>
  );
}
