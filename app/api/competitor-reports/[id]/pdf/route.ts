import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { renderCompetitorReportPdf } from '@/lib/reporting/render-competitor-report-pdf';
import type { CompetitorReportData } from '@/lib/reporting/competitor-report-types';

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
    .from('competitor_reports')
    .select('id, client_id, organization_id, report_json, client:clients(name)')
    .eq('id', id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }
  if (!isAdmin) {
    if (!me?.organization_id || report.organization_id !== me.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const data = report.report_json as unknown as CompetitorReportData;
  const pdf = await renderCompetitorReportPdf(data);
  if (!pdf) {
    return NextResponse.json({ error: 'PDF render failed' }, { status: 500 });
  }

  const clientName = Array.isArray(report.client)
    ? report.client[0]?.name ?? 'client'
    : (report.client as { name?: string } | null)?.name ?? 'client';
  const filename = `competitor-report-${clientName.toLowerCase().replace(/\s+/g, '-')}-${id.slice(0, 8)}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
