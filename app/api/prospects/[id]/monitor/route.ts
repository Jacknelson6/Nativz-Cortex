// SPY-06 T15: GET + POST monitor config.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const PostSchema = z.object({
  active: z.boolean(),
  frequency: z.enum(['weekly', 'biweekly']).default('weekly'),
  day_of_week: z.number().int().min(0).max(6).default(1),
});

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const admin = createAdminClient();

    const [{ data: config }, { data: snapshots }, { data: alerts }] = await Promise.all([
      admin
        .from('prospect_monitor_config')
        .select('*')
        .eq('prospect_id', id)
        .maybeSingle(),
      admin
        .from('prospect_monitor_snapshots')
        .select('*')
        .eq('prospect_id', id)
        .order('captured_at', { ascending: false })
        .limit(10),
      admin
        .from('prospect_monitor_alerts')
        .select('*')
        .eq('prospect_id', id)
        .order('occurred_at', { ascending: false })
        .limit(50),
    ]);

    return NextResponse.json({
      config: config ?? null,
      recent_snapshots: snapshots ?? [],
      recent_alerts: alerts ?? [],
    });
  } catch (err) {
    console.error('GET /api/prospects/[id]/monitor error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: prospect } = await admin
      .from('prospects')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    const payload = {
      prospect_id: id,
      active: parsed.data.active,
      frequency: parsed.data.frequency,
      day_of_week: parsed.data.day_of_week,
      paused_at: parsed.data.active ? null : new Date().toISOString(),
      created_by: auth.userId,
    };

    const { data: upserted, error } = await admin
      .from('prospect_monitor_config')
      .upsert(payload, { onConflict: 'prospect_id' })
      .select('*')
      .single();

    if (error || !upserted) {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to save config' },
        { status: 500 },
      );
    }

    return NextResponse.json({ config: upserted });
  } catch (err) {
    console.error('POST /api/prospects/[id]/monitor error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
