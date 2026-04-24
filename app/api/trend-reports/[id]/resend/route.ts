import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTrendReportEmail } from '@/lib/email/resend';
import type { TrendReportData } from '@/lib/reporting/trend-report-types';

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
    .from('trend_reports')
    .select(
      'id, subscription_id, client_id, organization_id, report_json, subscription:trend_report_subscriptions(recipients, include_portal_users)',
    )
    .eq('id', id)
    .single();

  if (error || !report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  const sub = Array.isArray(report.subscription) ? report.subscription[0] : report.subscription;
  if (!sub) return NextResponse.json({ error: 'Subscription missing' }, { status: 500 });

  const data = report.report_json as unknown as TrendReportData;
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io';
  const dashboardUrl = `${appBaseUrl}/admin/finder/monitors`;

  const result = await sendTrendReportEmail({
    to: sub.recipients ?? [],
    data,
    dashboardUrl,
  });

  await admin
    .from('trend_reports')
    .update({
      email_resend_id: result.ok ? result.id : null,
      email_status: result.ok ? 'sent' : 'failed',
      email_error: result.ok ? null : result.error,
    })
    .eq('id', id);

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, resendId: result.id });
}
