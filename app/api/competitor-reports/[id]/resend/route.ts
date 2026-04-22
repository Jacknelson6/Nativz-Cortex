import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendCompetitorReportEmail } from '@/lib/email/resend';
import type { CompetitorReportData } from '@/lib/reporting/competitor-report-types';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin' || me?.is_super_admin;
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const { data: report, error } = await admin
    .from('competitor_reports')
    .select(
      'id, subscription_id, client_id, organization_id, report_json, subscription:competitor_report_subscriptions(recipients, include_portal_users, cadence)',
    )
    .eq('id', id)
    .single();

  if (error || !report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  const sub = Array.isArray(report.subscription) ? report.subscription[0] : report.subscription;
  if (!sub) {
    return NextResponse.json({ error: 'Subscription missing' }, { status: 500 });
  }

  const data = report.report_json as unknown as CompetitorReportData;
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io';
  const analyticsUrl = `${appBaseUrl}/admin/analytics?tab=benchmarking&client=${report.client_id}`;

  const result = await sendCompetitorReportEmail({
    to: sub.recipients ?? [],
    data,
    analyticsUrl,
  });

  const updateFields: Record<string, unknown> = {
    email_resend_id: result.ok ? result.id : null,
    email_status: result.ok ? 'sent' : 'failed',
    email_error: result.ok ? null : result.error,
  };
  await admin.from('competitor_reports').update(updateFields).eq('id', id);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resendId: result.id });
}
