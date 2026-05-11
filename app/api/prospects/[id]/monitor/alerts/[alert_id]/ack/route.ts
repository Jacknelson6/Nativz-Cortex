// SPY-06 T17: ack an alert.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data } = await admin.from('users').select('role').eq('id', user.id).single();
  if (!data || !['admin', 'super_admin'].includes(data.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; alert_id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id, alert_id } = await params;
    const admin = createAdminClient();

    const { data: alert } = await admin
      .from('prospect_monitor_alerts')
      .select('id, prospect_id')
      .eq('id', alert_id)
      .maybeSingle();
    if (!alert || alert.prospect_id !== id) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    await admin
      .from('prospect_monitor_alerts')
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: auth.userId,
      })
      .eq('id', alert_id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/prospects/[id]/monitor/alerts/[alert_id]/ack error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
