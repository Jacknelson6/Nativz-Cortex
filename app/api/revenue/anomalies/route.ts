import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const scope = req.nextUrl.searchParams.get('scope') ?? 'open';
  let q = admin
    .from('revenue_anomalies')
    .select('id, detector, severity, entity_type, entity_id, client_id, title, description, metadata, first_detected_at, last_detected_at, resolved_at, dismissed_at, clients(name, slug)')
    .order('severity')
    .order('last_detected_at', { ascending: false })
    .limit(500);
  if (scope === 'open') {
    q = q.is('resolved_at', null).is('dismissed_at', null);
  } else if (scope === 'resolved') {
    q = q.not('resolved_at', 'is', null);
  } else if (scope === 'dismissed') {
    q = q.not('dismissed_at', 'is', null);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ anomalies: data ?? [] });
}

const dismissSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin, userId } = auth;

  const raw = await req.json().catch(() => null);
  const parsed = dismissSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { error } = await admin
    .from('revenue_anomalies')
    .update({
      dismissed_at: new Date().toISOString(),
      dismissed_by: userId,
      dismissed_reason: parsed.data.reason ?? null,
    })
    .eq('id', parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
