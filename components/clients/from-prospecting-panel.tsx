// SPY-07 T10: "From prospecting" panel that surfaces a converted client's
// prospect-era history (audit date, scorecard, latest benchmark, alerts,
// monitor state) with deep-links back into the archived prospect record.
// Server-rendered so the page composes cleanly without a client boundary;
// renders nothing if the client wasn't converted from a prospect.

import Link from 'next/link';
import { ArrowRight, History, Sparkles, Swords, Bell, Activity } from 'lucide-react';
import { IconCard } from '@/components/ui/icon-card';
import { createAdminClient } from '@/lib/supabase/admin';

interface FromProspectingPanelProps {
  clientId: string;
}

interface ScorecardShape {
  overall?: number | null;
  pillars?: Record<string, { score?: number | null }> | null;
}

interface BenchmarkShape {
  id: string;
  status: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export async function FromProspectingPanel({ clientId }: FromProspectingPanelProps) {
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id, converted_from_prospect_id')
    .eq('id', clientId)
    .maybeSingle();

  if (!client?.converted_from_prospect_id) return null;
  const prospectId = client.converted_from_prospect_id;

  const [prospectRes, analysisRes, benchmarkRes, alertCountsRes, monitorRes] =
    await Promise.all([
      admin
        .from('prospects')
        .select('id, brand_name, created_at, archived_at')
        .eq('id', prospectId)
        .maybeSingle(),
      admin
        .from('prospect_analyses')
        .select('id, created_at, scorecard')
        .eq('prospect_id', prospectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('prospect_competitor_benchmarks')
        .select('id, status, created_at, completed_at')
        .eq('prospect_id', prospectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('prospect_monitor_alerts')
        .select('id, severity')
        .eq('prospect_id', prospectId),
      admin
        .from('prospect_monitor_config')
        .select('active, paused_at, last_run_at')
        .eq('prospect_id', prospectId)
        .maybeSingle(),
    ]);

  const prospect = prospectRes.data;
  const scorecard = (analysisRes.data?.scorecard ?? null) as ScorecardShape | null;
  const benchmark = (benchmarkRes.data ?? null) as BenchmarkShape | null;
  const alerts = alertCountsRes.data ?? [];
  const highCount = alerts.filter((a) => a.severity === 'high').length;
  const monitor = monitorRes.data;

  return (
    <IconCard
      icon={<History size={16} />}
      title="From prospecting"
      helpText="Snapshot of the audits, scorecard, and alerts gathered while this brand was a prospect. Everything stays queryable from the archived prospect record."
      action={
        <Link
          href={`/admin/prospects/${prospectId}`}
          className="inline-flex items-center gap-1 text-xs text-accent-text hover:underline"
        >
          Prospect record <ArrowRight size={12} />
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Tile
          icon={<Sparkles size={14} />}
          label="Original audit"
          value={analysisRes.data?.created_at ? formatDate(analysisRes.data.created_at) : 'No audit'}
          sub={
            scorecard?.overall != null
              ? `Scorecard ${Math.round(scorecard.overall * 100) / 100}`
              : prospect?.brand_name ?? null
          }
        />
        <Tile
          icon={<Swords size={14} />}
          label="Latest benchmark"
          value={
            benchmark?.completed_at
              ? formatDate(benchmark.completed_at)
              : benchmark?.status ?? 'None run'
          }
          sub={benchmark ? `Status ${benchmark.status ?? 'unknown'}` : null}
        />
        <Tile
          icon={<Bell size={14} />}
          label="Alerts"
          value={`${alerts.length} total`}
          sub={highCount > 0 ? `${highCount} high severity` : 'No high-severity alerts'}
        />
        <Tile
          icon={<Activity size={14} />}
          label="Monitor"
          value={monitor?.active ? 'Active' : 'Paused'}
          sub={
            monitor?.last_run_at
              ? `Last run ${formatDate(monitor.last_run_at)}`
              : 'Never run'
          }
        />
        <Tile
          icon={<History size={14} />}
          label="Prospect created"
          value={prospect?.created_at ? formatDate(prospect.created_at) : 'Unknown'}
          sub={prospect?.archived_at ? `Archived ${formatDate(prospect.archived_at)}` : null}
        />
      </div>
    </IconCard>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string | null;
}) {
  return (
    <div className="rounded-lg border border-nativz-border bg-surface-hover px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-text-primary">{value}</div>
      {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
