// SPY-07 T08: GET /api/clients/[id]/from-prospecting — aggregated digest
// of the prospect-era data for a converted client. Backs the
// FromProspectingPanel on the client detail page.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';

export const maxDuration = 30;

async function handleGet(clientId: string) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { data: client } = await admin
    .from('clients')
    .select('id, converted_from_prospect_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  if (!client.converted_from_prospect_id) {
    return NextResponse.json({ error: 'Client not converted from a prospect' }, { status: 404 });
  }

  const prospectId = client.converted_from_prospect_id;

  const [prospectRes, latestAnalysisRes, latestBenchmarkRes, alertCountsRes, monitorRes] =
    await Promise.all([
      admin
        .from('prospects')
        .select('id, brand_name, created_at, archived_at')
        .eq('id', prospectId)
        .maybeSingle(),
      admin
        .from('prospect_analyses')
        .select('id, created_at, scorecard, status')
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
        .select('id, severity', { count: 'exact' })
        .eq('prospect_id', prospectId),
      admin
        .from('prospect_monitor_config')
        .select('active, paused_at, last_run_at')
        .eq('prospect_id', prospectId)
        .maybeSingle(),
    ]);

  const alerts = alertCountsRes.data ?? [];
  const highCount = alerts.filter((a) => a.severity === 'high').length;

  return NextResponse.json({
    prospect_id: prospectId,
    prospect_brand_name: prospectRes.data?.brand_name ?? null,
    original_audit_date: latestAnalysisRes.data?.created_at ?? null,
    scorecard: latestAnalysisRes.data?.scorecard ?? null,
    latest_benchmark: latestBenchmarkRes.data ?? null,
    alerts_count: { total: alerts.length, high: highCount },
    monitor_active: monitorRes.data?.active ?? false,
    monitor_last_run_at: monitorRes.data?.last_run_at ?? null,
    links: {
      prospect_detail: `/admin/prospects/${prospectId}`,
      scorecard_share: null,
      benchmark_share: null,
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleGet(id);
}
