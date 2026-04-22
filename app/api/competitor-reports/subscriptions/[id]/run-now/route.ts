import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAndSendReport } from '@/lib/reporting/generate-competitor-report';
import type { CompetitorReportCadence } from '@/lib/reporting/competitor-report-types';

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
    .from('competitor_report_subscriptions')
    .select(
      'id, client_id, organization_id, cadence, recipients, include_portal_users, enabled, last_run_at, next_run_at',
    )
    .eq('id', id)
    .single();
  if (error || !sub) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  const result = await generateAndSendReport({
    id: sub.id as string,
    client_id: sub.client_id as string,
    organization_id: (sub.organization_id as string | null) ?? null,
    cadence: sub.cadence as CompetitorReportCadence,
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
