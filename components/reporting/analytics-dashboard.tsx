'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw, Download, Flame } from 'lucide-react';
import { ComboSelect } from '@/components/ui/combo-select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportingData } from './hooks/use-reporting-data';
import { DateRangePicker } from './date-range-picker';
import { OverviewKpiRow } from './overview-kpi-row';
import { PlatformSection } from './platform-section';
import { TopPostsView } from './top-posts-view';
import { PlatformBreakdownTable } from './platform-breakdown-table';
import { PostDetailsGrid } from './post-details-grid';
import { AnalysisChatDrawer } from '@/components/analyses/analysis-chat-drawer';
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
    compareEnabled,
    setCompareEnabled,
    comparePreset,
    setComparePreset,
    compareRange,
    setCompareRange,
    summary,
    compareSummary,
    loading,
    dataLoading,
    syncing,
    syncNow,
    fetchTopPostsForReport,
  } = useReportingData(initialClientId);

  const [reportOpen, setReportOpen] = useState(false);

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
          <div className="flex items-center gap-3">
            <DateRangePicker
              value={datePreset}
              onChange={setDatePreset}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
              compareEnabled={compareEnabled}
              onCompareEnabledChange={setCompareEnabled}
              comparePreset={comparePreset}
              onComparePresetChange={setComparePreset}
              onCompareRangeChange={setCompareRange}
            />
          </div>

          {/* KPI tiles — 3 tiles: Followers Δ, Views, Engagement. */}
          <OverviewKpiRow
            data={summary}
            loading={dataLoading}
            compareData={compareEnabled ? compareSummary : null}
            compareRange={compareEnabled ? compareRange : null}
          />

          {/* Top performers — compact horizontal cards. */}
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

          {/* Platform breakdown table — always visible summary row. */}
          {summary?.platformBreakdown && summary.platformBreakdown.length > 0 && (
            <PlatformBreakdownTable rows={summary.platformBreakdown} />
          )}

          {/* Per-platform sections — always expanded per Jack's 2026-04-21 ask. */}
          {summary?.platforms && summary.platforms.length > 0 && (
            <section className="space-y-5 rounded-xl border border-nativz-border bg-surface p-5">
              <h2 className="text-base font-semibold text-text-primary">Platform details</h2>
              <div className="space-y-8">
                {(['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin'] as const)
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
            </section>
          )}

          {/* Full post details grid — filterable list of every post, default
              sorted by most engagement per Jack's 2026-04-21 ask. */}
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

      {/* Ask the Nerd — floating chat, scoped to the active client so the
          assistant sees analytics context automatically. */}
      {selectedClient && (
        <AnalysisChatDrawer
          scopeType="social_analytics"
          scopeId={selectedClient.id}
          scopeLabel={selectedClient.name}
        />
      )}
    </div>
  );
}
