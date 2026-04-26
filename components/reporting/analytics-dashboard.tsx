'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportingData } from './hooks/use-reporting-data';
import { DateRangePicker } from './date-range-picker';
import { OverviewKpiRow } from './overview-kpi-row';
import { PlatformSection } from './platform-section';
import { PlatformBreakdownTable } from './platform-breakdown-table';
import { PostDetailsGrid } from './post-details-grid';
import { SyncErrorsPanel } from './sync-errors-panel';
import { AnalysisChatDrawer } from '@/components/analyses/analysis-chat-drawer';

const ReportBuilder = dynamic(() => import('./report-builder').then(m => ({ default: m.ReportBuilder })));

function fmtCompareDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function AnalyticsDashboard({ initialClientId }: { initialClientId?: string | null } = {}) {
  const {
    selectedClient,
    selectedClientId,
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
    syncErrors,
    syncNow,
    fetchTopPostsForReport,
  } = useReportingData(initialClientId);

  const [reportOpen, setReportOpen] = useState(false);

  // Pre-formatted "vs Mar 1 – Mar 28" hint — the per-platform sparkline cards
  // surface this beneath the prior-period total so a reader can tell at a
  // glance which window the dashed ghost line represents.
  const compareLabel =
    compareEnabled && compareRange
      ? `vs ${fmtCompareDate(compareRange.start)} – ${fmtCompareDate(compareRange.end)}`
      : undefined;

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

  return (
    <div className="space-y-6">
      {/* Header row — brand selection lives in the top-bar pill, so this row
          only carries the per-brand actions (sync + download). */}
      <div className="flex flex-wrap items-center gap-3">
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

          {syncErrors.length > 0 && <SyncErrorsPanel errors={syncErrors} />}

          {/* KPI tiles — 3 tiles: Followers Δ, Views, Engagement. */}
          <OverviewKpiRow
            data={summary}
            loading={dataLoading}
            compareData={compareEnabled ? compareSummary : null}
            compareRange={compareEnabled ? compareRange : null}
          />

          {/* Platform breakdown table — always visible summary row. */}
          {summary?.platformBreakdown && summary.platformBreakdown.length > 0 && (
            <PlatformBreakdownTable rows={summary.platformBreakdown} />
          )}

          {/* Per-platform sections — always expanded per Jack's 2026-04-21 ask.
              Eyebrow removed: the platform-brand badge inside each section
              header already names the network, so a "Platform details" h2
              was redundant chrome. */}
          {summary?.platforms && summary.platforms.length > 0 && (
            <section className="space-y-8 rounded-xl border border-nativz-border bg-surface p-5">
              {(['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin'] as const)
                .filter((p) => summary.platforms.some((ps) => ps.platform === p))
                .map((platform) => {
                  const ps = summary.platforms.find((s) => s.platform === platform)!;
                  const cs =
                    compareEnabled
                      ? compareSummary?.platforms?.find((s) => s.platform === platform) ?? null
                      : null;
                  const chartData = summary.platformCharts?.[platform] ?? [];
                  return (
                    <PlatformSection
                      key={platform}
                      summary={ps}
                      chartData={chartData}
                      compareSummary={cs}
                      compareLabel={compareLabel}
                    />
                  );
                })}
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
