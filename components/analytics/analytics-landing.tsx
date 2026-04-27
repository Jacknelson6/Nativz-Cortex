'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Share2, Handshake } from 'lucide-react';
import type { PortfolioClient } from '@/components/ui/client-portfolio-selector';
import { SubNav, type SubNavItem } from '@/components/ui/sub-nav';

const AnalyticsDashboard = dynamic(
  () => import('@/components/reporting/analytics-dashboard').then(m => ({ default: m.AnalyticsDashboard })),
);
const AffiliatesDashboard = dynamic(
  () => import('@/components/affiliates/affiliates-dashboard').then(m => ({ default: m.AffiliatesDashboard })),
);
const AuditBenchmarksPanel = dynamic(
  () => import('@/components/analytics/audit-benchmarks-panel').then(m => ({ default: m.AuditBenchmarksPanel })),
);

// Tab hierarchy. Affiliates is a client-scoped service — surfaced only for
// brands carrying that contract item — so the tab strip collapses entirely
// when Social would be the lone option.
export type TabId = 'social' | 'affiliates';
export type SubTabId = 'overview' | 'benchmarking';

const ALL_TABS: { id: TabId; label: string; icon: typeof Share2 }[] = [
  { id: 'social', label: 'Social', icon: Share2 },
  { id: 'affiliates', label: 'Affiliates', icon: Handshake },
];

const TABS_WITH_SUBS: TabId[] = ['social'];

const SUB_TABS: SubNavItem<SubTabId>[] = [
  { slug: 'overview', label: 'Overview' },
  { slug: 'benchmarking', label: 'Benchmarking' },
];

interface AnalyticsLandingProps {
  clients: PortfolioClient[];
  initialClientId: string | null;
  initialTab: TabId;
  initialSub: SubTabId;
  hasAffiliates: boolean;
}

export function AnalyticsLanding({
  clients,
  initialClientId,
  initialTab,
  initialSub,
  hasAffiliates,
}: AnalyticsLandingProps) {
  const router = useRouter();
  // Client selection lives at the top-bar brand pill now — no in-page
  // portfolio picker, no back-arrow, no ?clientId= back-compat needed at
  // this layer. The server page resolves the pill's active brand and
  // passes it in as initialClientId; if nothing is pinned we show a
  // gentle "pick a brand" state.
  const selectedClientId = initialClientId;
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [activeSub, setActiveSub] = useState<SubTabId>(initialSub);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  function pushUrl(nextTab: TabId, nextSub: SubTabId) {
    const params = new URLSearchParams();
    params.set('tab', nextTab);
    if (TABS_WITH_SUBS.includes(nextTab)) params.set('sub', nextSub);
    router.replace(`/admin/analytics?${params.toString()}`, { scroll: false });
  }

  function handleChangeTab(tab: TabId) {
    setActiveTab(tab);
    // Reset to Overview when switching between tabs with sub-navs — feels
    // less surprising than preserving the previous sub for the new tab.
    const nextSub: SubTabId = TABS_WITH_SUBS.includes(tab) ? 'overview' : activeSub;
    setActiveSub(nextSub);
    pushUrl(tab, nextSub);
  }

  function handleChangeSub(sub: SubTabId) {
    setActiveSub(sub);
    pushUrl(activeTab, sub);
  }

  if (!selectedClientId) {
    return (
      <div className="cortex-page-gutter py-8 space-y-4">
        <h1 className="ui-page-title">Analytics</h1>
        <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center">
          <p className="text-sm text-text-muted">
            Pick a brand in the top-bar pill to view its analytics.
          </p>
        </div>
      </div>
    );
  }

  const showSubTabs = TABS_WITH_SUBS.includes(activeTab);
  // Tab strip only earns its place when there's something to switch to.
  // Affiliates is the only optional surface today, so without it the strip
  // would render a single Social pill — chrome with no purpose.
  const visibleTabs = hasAffiliates ? ALL_TABS : [];

  return (
    <div className="cortex-page-gutter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="ui-page-title">Analytics</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {selectedClient?.name ?? 'Client'} performance
          </p>
        </div>

        {visibleTabs.length > 0 && (
          <div className="flex items-center rounded-lg border border-nativz-border bg-surface p-0.5">
            {visibleTabs.map(tab => (
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
        )}
      </div>

      {showSubTabs && (
        <SubNav
          items={SUB_TABS}
          active={activeSub}
          onChange={handleChangeSub}
          ariaLabel="Analytics sub-sections"
        />
      )}

      {activeTab === 'social' && activeSub === 'overview' && (
        <AnalyticsDashboard initialClientId={selectedClientId} />
      )}

      {activeTab === 'social' && activeSub === 'benchmarking' && (
        <SocialBenchmarkingPanel
          clientId={selectedClientId}
          clientName={selectedClient?.name ?? 'Client'}
        />
      )}

      {activeTab === 'affiliates' && hasAffiliates && <AffiliatesDashboard />}
    </div>
  );
}

function SocialBenchmarkingPanel({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="ui-section-title">Benchmarking</h2>
        <p className="mt-0.5 text-sm text-text-secondary">
          How {clientName} stacks up against tracked competitors. Manage the
          watchlist from the Spy hub.
        </p>
      </header>

      <AuditBenchmarksPanel clientId={clientId} clientName={clientName} />
    </div>
  );
}

