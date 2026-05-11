// ZNA-03: admin GET. Returns today's non-dismissed pulse for a client.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/require-admin';

const QuerySchema = z.object({ client_id: z.string().uuid() });

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ client_id: url.searchParams.get('client_id') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid client_id' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await auth.admin
    .from('client_analytics_pulses')
    .select(
      'id, client_id, pulse_date, generated_at, body, signal_metric, signal_value, platforms_referenced, referenced_post_ids, is_dismissed, is_locked, flagged_wrong_at',
    )
    .eq('client_id', parsed.data.client_id)
    .eq('pulse_date', today)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  if (!data || data.is_dismissed) {
    return NextResponse.json({ pulse: null });
  }

  return NextResponse.json({ pulse: data });
}
