// SPY-06 T18: global alert feed across all prospects with filters.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  severity: z.enum(['low', 'medium', 'high']).optional(),
  kind: z.enum(['follower_jump', 'viral_post', 'cadence_shift', 'format_pivot']).optional(),
  acknowledged: z.enum(['true', 'false']).optional(),
  since: z.string().datetime().optional(),
  prospect_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
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
  return { ok: true };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const sp = request.nextUrl.searchParams;
    const parsed = QuerySchema.safeParse({
      severity: sp.get('severity') ?? undefined,
      kind: sp.get('kind') ?? undefined,
      acknowledged: sp.get('acknowledged') ?? undefined,
      since: sp.get('since') ?? undefined,
      prospect_id: sp.get('prospect_id') ?? undefined,
      limit: sp.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    const q = parsed.data;

    const admin = createAdminClient();
    let query = admin
      .from('prospect_monitor_alerts')
      .select('*, prospect:prospects(id, brand_name)')
      .order('occurred_at', { ascending: false })
      .limit(q.limit);

    if (q.severity) query = query.eq('severity', q.severity);
    if (q.kind) query = query.eq('kind', q.kind);
    if (q.prospect_id) query = query.eq('prospect_id', q.prospect_id);
    if (q.since) query = query.gte('occurred_at', q.since);
    if (q.acknowledged === 'true') query = query.not('acknowledged_at', 'is', null);
    if (q.acknowledged === 'false') query = query.is('acknowledged_at', null);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alerts: data ?? [] });
  } catch (err) {
    console.error('GET /api/prospects/alerts error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
