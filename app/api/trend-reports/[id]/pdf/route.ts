import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { renderTrendReportPdf } from '@/lib/reporting/render-trend-report-pdf';
import type { TrendReportData } from '@/lib/reporting/trend-report-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin, organization_id')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin' || me?.is_super_admin;

  const { id } = await params;
  const { data: report, error } = await admin
    .from('trend_reports')
    .select('id, organization_id, report_json, subscription:trend_report_subscriptions(name)')
    .eq('id', id)
    .single();
  if (error || !report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  if (!isAdmin) {
    if (!me?.organization_id || report.organization_id !== me.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const data = report.report_json as unknown as TrendReportData;
  const pdf = await renderTrendReportPdf(data);
  if (!pdf) return NextResponse.json({ error: 'PDF render failed' }, { status: 500 });

  const subName = Array.isArray(report.subscription)
    ? report.subscription[0]?.name ?? 'trend-report'
    : (report.subscription as { name?: string } | null)?.name ?? 'trend-report';
  const filename = `trend-report-${subName.toLowerCase().replace(/\s+/g, '-')}-${id.slice(0, 8)}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
