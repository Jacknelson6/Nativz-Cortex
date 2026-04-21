'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Share2, Handshake, DollarSign, Search } from 'lucide-react';
import type { PortfolioClient } from '@/components/ui/client-portfolio-selector';

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

// NAT-37 — top-level tab hierarchy per the approved NAT-36 spec. Paid media
// and SEO are placeholder tabs for now so the structure is in place when we
// build them (GBP moves to Paid media; SEO lands when the rank/traffic data
// does).
export type TabId = 'social' | 'paid' | 'seo' | 'affiliates';
export type SubTabId = 'overview' | 'benchmarking';

const TABS: { id: TabId; label: string; icon: typeof Share2 }[] = [
  { id: 'social', label: 'Social', icon: Share2 },
  { id: 'paid', label: 'Paid media', icon: DollarSign },
  { id: 'seo', label: 'SEO', icon: Search },
  { id: 'affiliates', label: 'Affiliates', icon: Handshake },
];

const TABS_WITH_SUBS: TabId[] = ['social', 'paid', 'seo'];

const SUB_TABS: { id: SubTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'benchmarking', label: 'Benchmarking' },
];

interface AnalyticsLandingProps {
  clients: PortfolioClient[];
  initialClientId: string | null;
  initialTab: TabId;
  initialSub: SubTabId;
}

export function AnalyticsLanding({
  clients,
  initialClientId,
  initialTab,
  initialSub,
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

  return (
    <div className="cortex-page-gutter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="ui-page-title">Analytics</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {selectedClient?.name ?? 'Client'} performance
          </p>
        </div>

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

      {showSubTabs && (
        <div className="flex items-center gap-1 border-b border-nativz-border">
          {SUB_TABS.map(sub => (
            <button
              key={sub.id}
              onClick={() => handleChangeSub(sub.id)}
              className={`px-3 py-2 text-xs font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
                activeSub === sub.id
                  ? 'border-accent-text text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {sub.label}
            </button>
          ))}
        </div>
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

      {activeTab === 'paid' && <ComingSoonTab kind="paid" />}
      {activeTab === 'seo' && <ComingSoonTab kind="seo" />}

      {activeTab === 'affiliates' && <AffiliatesDashboard />}
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
    <div className="space-y-8">
      <header>
        <h2 className="text-lg font-semibold text-text-primary">Benchmarking</h2>
        <p className="mt-0.5 text-sm text-text-secondary">
          How {clientName} stacks up against tracked social competitors and audit-driven peers.
          Add new competitors from Competitor Spying.
        </p>
      </header>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Tracked competitors
          </h3>
          <p className="text-xs text-text-muted/70">Added manually — refreshable on demand.</p>
        </div>
        <BenchmarkingDashboard clientId={clientId} clientName={clientName} />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Audit-driven benchmarks
          </h3>
          <p className="text-xs text-text-muted/70">
            Updated on the configured cadence per attached audit.
          </p>
        </div>
        <AuditBenchmarksPanel clientId={clientId} clientName={clientName} />
      </section>
    </div>
  );
}

function ComingSoonTab({ kind }: { kind: 'paid' | 'seo' }) {
  const copy = {
    paid: {
      title: 'Paid media',
      body: 'Unified view of Google Ads, Meta ads, and Google Business Profile insights. Coming with the Paid media milestone.',
    },
    seo: {
      title: 'SEO',
      body: 'Rankings, traffic sources, and backlink deltas. Coming with the SEO milestone.',
    },
  }[kind];

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
      <h2 className="text-lg font-semibold text-text-primary">{copy.title}</h2>
      <p className="mt-2 text-sm text-text-muted max-w-md mx-auto">{copy.body}</p>
    </div>
  );
}
