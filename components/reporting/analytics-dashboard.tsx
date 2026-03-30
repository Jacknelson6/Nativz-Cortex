'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw, Download } from 'lucide-react';
import { ComboSelect } from '@/components/ui/combo-select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useReportingData } from './hooks/use-reporting-data';
import { DateRangePicker } from './date-range-picker';
import { SummaryView } from './summary-view';
import { TopPostsView } from './top-posts-view';

const ReportBuilder = dynamic(() => import('./report-builder').then(m => ({ default: m.ReportBuilder })));

const viewTabs: { value: 'summary' | 'top-posts'; label: string }[] = [
  { value: 'summary', label: 'Performance summary' },
  { value: 'top-posts', label: 'Top posts' },
];

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
    activeView,
    setActiveView,
    topPostsLimit,
    setTopPostsLimit,
    summary,
    topPosts,
    loading,
    dataLoading,
    syncing,
    syncNow,
    fetchTopPostsForReport,
  } = useReportingData(initialClientId);

  const [reportOpen, setReportOpen] = useState(false);

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
          {/* Controls row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <DateRangePicker
              value={datePreset}
              onChange={setDatePreset}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
            />

            <div className="inline-flex rounded-lg bg-surface-hover/50 p-1">
              {viewTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveView(tab.value)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                    activeView === tab.value
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          {activeView === 'summary' ? (
            <SummaryView data={summary} loading={dataLoading} />
          ) : (
            <TopPostsView
              posts={topPosts}
              loading={dataLoading}
              limit={topPostsLimit}
              onLimitChange={setTopPostsLimit}
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
