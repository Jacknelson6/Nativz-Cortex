import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAndSendTrendReport } from '@/lib/reporting/generate-trend-report';
import type { TrendReportCadence } from '@/lib/reporting/trend-report-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
  const { data: sub, error } = await admin
    .from('trend_report_subscriptions')
    .select(
      'id, client_id, organization_id, name, topic_query, keywords, brand_names, platforms, cadence, recipients, include_portal_users, enabled, last_run_at, next_run_at',
    )
    .eq('id', id)
    .single();
  if (error || !sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

  const result = await generateAndSendTrendReport({
    id: sub.id as string,
    client_id: (sub.client_id as string | null) ?? null,
    organization_id: (sub.organization_id as string | null) ?? null,
    name: sub.name as string,
    topic_query: sub.topic_query as string,
    keywords: (sub.keywords as string[]) ?? [],
    brand_names: (sub.brand_names as string[]) ?? [],
    platforms: (sub.platforms as string[]) ?? [],
    cadence: sub.cadence as TrendReportCadence,
    recipients: (sub.recipients as string[]) ?? [],
    include_portal_users: sub.include_portal_users as boolean,
    enabled: sub.enabled as boolean,
    last_run_at: sub.last_run_at as string | null,
    next_run_at: sub.next_run_at as string,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ...result, ok: false },
      { status: result.skippedReason ? 200 : 500 },
    );
  }
  return NextResponse.json({ ok: true, reportId: result.reportId, resendId: result.resendId });
}
