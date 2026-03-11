'use client';

import { useState } from 'react';
import { RefreshCw, Users, ShoppingCart, DollarSign, TrendingUp, Download } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ComboSelect } from '@/components/ui/combo-select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from '@/components/reporting/date-range-picker';
import { useAffiliatesData } from './hooks/use-affiliates-data';
import { AffiliateReportBuilder } from './affiliate-report-builder';
import type { AffiliateKpis, SnapshotPoint, TopAffiliate, PendingPayout } from './hooks/use-affiliates-data';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    denied: 'bg-red-500/10 text-red-400 border-red-500/20',
    inactive: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${colors[status] ?? colors.inactive}`}>
      {status}
    </span>
  );
}

export function AffiliatesDashboard() {
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
    kpis,
    snapshots,
    topAffiliates,
    recentReferrals,
    pendingPayouts,
    loading,
    dataLoading,
    syncing,
    syncNow,
  } = useAffiliatesData();

  const [reportOpen, setReportOpen] = useState(false);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header row */}
        <div className="flex flex-wrap items-end gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>
        {/* Date picker */}
        <Skeleton className="h-10 w-80" />
        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        {/* Trend chart */}
        <Skeleton className="h-72 rounded-xl" />
        {/* Affiliates table */}
        <Skeleton className="h-64 rounded-xl" />
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
        {selectedClientId && kpis && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReportOpen(true)}
          >
            <Download size={14} />
            Download report
          </Button>
        )}
      </div>

      {!selectedClientId ? (
        <p className="text-center text-text-muted py-16">
          Select a client to view affiliate data
        </p>
      ) : (
        <>
          {/* Date picker */}
          <DateRangePicker
            value={datePreset}
            onChange={setDatePreset}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />

          {/* KPI cards */}
          {dataLoading || !kpis ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : (
            <KpiCards kpis={kpis} />
          )}

          {/* Trend chart */}
          {dataLoading ? (
            <Skeleton className="h-72" />
          ) : snapshots.length > 1 ? (
            <TrendChart snapshots={snapshots} />
          ) : snapshots.length === 1 ? (
            <div className="rounded-xl border border-nativz-border bg-surface p-5">
              <p className="text-sm text-text-muted text-center py-8">
                Trend chart will appear once we have multiple days of data
              </p>
            </div>
          ) : null}

          {/* Top affiliates */}
          {dataLoading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : topAffiliates.length > 0 && (
            <TopAffiliatesTable affiliates={topAffiliates} />
          )}

          {/* Pending payouts */}
          {dataLoading ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : pendingPayouts.length > 0 && (
            <PendingPayoutsTable payouts={pendingPayouts} totalPending={kpis?.totalPending ?? 0} />
          )}
        </>
      )}

      {/* Report builder modal */}
      {selectedClient && kpis && (
        <AffiliateReportBuilder
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          clientName={selectedClient.name}
          clientId={selectedClient.id}
          agency={selectedClient.agency}
          logoUrl={selectedClient.logoUrl}
          dateRange={dateRange}
          kpis={kpis}
          topAffiliates={topAffiliates}
          pendingPayouts={pendingPayouts}
          snapshots={snapshots}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Cards
// ---------------------------------------------------------------------------

function KpiCards({ kpis }: { kpis: AffiliateKpis }) {
  const cards = [
    {
      label: 'New affiliates',
      value: kpis.newAffiliates,
      icon: Users,
    },
    {
      label: 'Referrals',
      value: kpis.referralsInPeriod,
      icon: ShoppingCart,
    },
    {
      label: 'Revenue',
      value: formatCurrency(kpis.periodRevenue),
      icon: DollarSign,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-nativz-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <card.icon size={14} className="text-text-muted" />
            <p className="text-xs font-medium text-text-muted">{card.label}</p>
          </div>
          <p className="text-2xl font-semibold text-text-primary">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend Chart
// ---------------------------------------------------------------------------

function TrendChart({ snapshots }: { snapshots: SnapshotPoint[] }) {
  const chartData = snapshots.map((s, i) => {
    const prev = i > 0 ? snapshots[i - 1] : null;
    const dailyAffiliates = prev ? Math.max(0, s.total_affiliates - prev.total_affiliates) : 0;

    return {
      date: s.snapshot_date,
      affiliates: dailyAffiliates,
      revenue: Number(s.daily_revenue) || 0,
      sales: Number(s.daily_sales_count) || 0,
    };
  }).slice(1); // Drop first day (no previous to diff against)

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={14} className="text-text-muted" />
        <p className="text-sm font-medium text-text-primary">Daily performance</p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 50, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="affGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={60}
              tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
              allowDecimals={false}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const dataPoint = payload[0]?.payload as Record<string, number> | undefined;
                const rev = dataPoint?.revenue ?? 0;
                const aff = dataPoint?.affiliates ?? 0;
                const sales = dataPoint?.sales ?? 0;
                return (
                  <div className="rounded-lg border border-white/10 bg-[rgb(30,30,35)] px-3 py-2 text-xs">
                    <p className="text-text-muted mb-1.5">{formatShortDate(String(label))}</p>
                    <p className="text-emerald-400">Revenue: {formatCurrency(rev)} ({sales} {sales === 1 ? 'referral' : 'referrals'})</p>
                    <p className="text-blue-400 mt-0.5">New affiliates: {aff}</p>
                  </div>
                );
              }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              stroke="#10b981"
              fill="url(#revGrad)"
              strokeWidth={2}
              dot={false}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="affiliates"
              stroke="#3b82f6"
              fill="url(#affGrad)"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-6 mt-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-text-muted">Revenue (left axis)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="text-xs text-text-muted">New affiliates (right axis)</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top Affiliates Table
// ---------------------------------------------------------------------------

function TopAffiliatesTable({ affiliates }: { affiliates: TopAffiliate[] }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_COUNT = 10;
  const visible = expanded ? affiliates : affiliates.slice(0, PREVIEW_COUNT);
  const hasMore = affiliates.length > PREVIEW_COUNT;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-nativz-border flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">Affiliates</p>
        <p className="text-xs text-text-muted">{affiliates.length} total</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-nativz-border text-text-muted">
              <th className="px-5 py-3 text-left font-medium">Name</th>
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Revenue</th>
              <th className="px-5 py-3 text-right font-medium">Referrals</th>
              <th className="px-5 py-3 text-right font-medium">Clicks</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.uppromote_id} className="border-b border-nativz-border last:border-0 hover:bg-surface-hover/50 transition-colors">
                <td className="px-5 py-3">
                  <p className="text-text-primary font-medium">{a.name}</p>
                  <p className="text-xs text-text-muted">{a.email}</p>
                </td>
                <td className="px-5 py-3"><StatusBadge status={a.status} /></td>
                <td className="px-5 py-3 text-right text-text-primary font-medium">{formatCurrency(a.revenue)}</td>
                <td className="px-5 py-3 text-right text-text-secondary">{a.referrals}</td>
                <td className="px-5 py-3 text-right text-text-secondary">{a.clicks.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full py-3 text-xs font-medium text-accent-text hover:bg-surface-hover/50 transition-colors border-t border-nativz-border"
        >
          {expanded ? 'Show less' : `View all ${affiliates.length} affiliates`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending Payouts Table
// ---------------------------------------------------------------------------

function PendingPayoutsTable({ payouts, totalPending }: { payouts: PendingPayout[]; totalPending: number }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-nativz-border flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">Pending payouts</p>
        <p className="text-sm font-semibold text-amber-400">{formatCurrency(totalPending)}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-nativz-border text-text-muted">
              <th className="px-5 py-3 text-left font-medium">Affiliate</th>
              <th className="px-5 py-3 text-right font-medium">Pending</th>
              <th className="px-5 py-3 text-right font-medium">Already paid</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.email} className="border-b border-nativz-border last:border-0 hover:bg-surface-hover/50 transition-colors">
                <td className="px-5 py-3">
                  <p className="text-text-primary font-medium">{p.name}</p>
                  <p className="text-xs text-text-muted">{p.email}</p>
                </td>
                <td className="px-5 py-3 text-right text-amber-400 font-medium">{formatCurrency(p.pending)}</td>
                <td className="px-5 py-3 text-right text-text-secondary">{formatCurrency(p.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
