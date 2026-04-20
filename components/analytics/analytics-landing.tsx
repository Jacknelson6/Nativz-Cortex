'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Share2, Handshake, TrendingUp, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientPortfolioSelector, type PortfolioClient } from '@/components/ui/client-portfolio-selector';

const AnalyticsDashboard = dynamic(
  () => import('@/components/reporting/analytics-dashboard').then(m => ({ default: m.AnalyticsDashboard })),
);
const AffiliatesDashboard = dynamic(
  () => import('@/components/affiliates/affiliates-dashboard').then(m => ({ default: m.AffiliatesDashboard })),
);
const BenchmarkingDashboard = dynamic(
  () => import('@/components/analytics/benchmarking-dashboard').then(m => ({ default: m.BenchmarkingDashboard })),
);
const AuditBenchmarksPanel = dynamic(
  () => import('@/components/analytics/audit-benchmarks-panel').then(m => ({ default: m.AuditBenchmarksPanel })),
);

type TabId = 'social' | 'affiliates' | 'benchmarking';

const TABS: { id: TabId; label: string; icon: typeof Share2 }[] = [
  { id: 'social', label: 'Social media', icon: Share2 },
  { id: 'affiliates', label: 'Affiliates', icon: Handshake },
  { id: 'benchmarking', label: 'Benchmarking', icon: TrendingUp },
];

interface AnalyticsLandingProps {
  clients: PortfolioClient[];
  initialClientId: string | null;
  initialTab: TabId;
}

export function AnalyticsLanding({ clients, initialClientId, initialTab }: AnalyticsLandingProps) {
  const router = useRouter();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  function handleSelectClient(clientId: string) {
    setSelectedClientId(clientId);
    // Update URL without full navigation
    const params = new URLSearchParams();
    params.set('clientId', clientId);
    params.set('tab', activeTab);
    router.replace(`/admin/analytics?${params.toString()}`, { scroll: false });
  }

  function handleChangeTab(tab: TabId) {
    setActiveTab(tab);
    if (selectedClientId) {
      const params = new URLSearchParams();
      params.set('clientId', selectedClientId);
      params.set('tab', tab);
      router.replace(`/admin/analytics?${params.toString()}`, { scroll: false });
    }
  }

  function handleBackToPortfolio() {
    setSelectedClientId(null);
    router.replace('/admin/analytics', { scroll: false });
  }

  // Show client portfolio selector if no client selected
  if (!selectedClientId) {
    return (
      <div className="cortex-page-gutter py-8">
        <div className="mb-8">
          <h1 className="ui-page-title">Analytics</h1>
          <p className="text-sm text-text-muted mt-0.5">Select a client to view performance data</p>
        </div>
        <ClientPortfolioSelector
          clients={clients}
          onSelect={handleSelectClient}
          title="Client portfolio"
          subtitle="Select a client to view their analytics"
        />
      </div>
    );
  }

  // Show analytics dashboard with tab switching
  return (
    <div className="cortex-page-gutter space-y-6">
      {/* Header with back button and tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackToPortfolio}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="ui-page-title">Analytics</h1>
            <p className="text-sm text-text-muted mt-0.5">
              {selectedClient?.name ?? 'Client'} performance
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center rounded-lg border border-nativz-border bg-surface p-0.5">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleChangeTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-accent-surface text-accent-text shadow-sm'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'social' && (
        <AnalyticsDashboard initialClientId={selectedClientId} />
      )}
      {activeTab === 'affiliates' && (
        <AffiliatesDashboard />
      )}
      {activeTab === 'benchmarking' && (
        <div className="space-y-8">
          <header>
            <h2 className="text-lg font-semibold text-text-primary">
              Benchmarking
            </h2>
            <p className="mt-0.5 text-sm text-text-secondary">
              How {selectedClient?.name ?? 'this client'} stacks up against tracked competitors and
              audit-driven peers. Add new competitors from Competitor Spying.
            </p>
          </header>

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                Tracked competitors
              </h3>
              <p className="text-xs text-text-muted/70">
                Added manually — refreshable on demand.
              </p>
            </div>
            <BenchmarkingDashboard
              clientId={selectedClientId}
              clientName={selectedClient?.name ?? 'Client'}
            />
          </section>

          {/* Audit-driven benchmarks — reads client_benchmarks +
              benchmark_snapshots populated by Analyze Social's
              "Attach to client" button. */}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                Audit-driven benchmarks
              </h3>
              <p className="text-xs text-text-muted/70">
                Updated on the configured cadence per attached audit.
              </p>
            </div>
            <AuditBenchmarksPanel
              clientId={selectedClientId}
              clientName={selectedClient?.name ?? 'Client'}
            />
          </section>
        </div>
      )}
    </div>
  );
}
