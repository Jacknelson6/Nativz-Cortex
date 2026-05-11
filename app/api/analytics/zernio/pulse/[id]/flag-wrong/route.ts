// ZNA-03: admin POST — flag a pulse as wrong. Does not auto-regenerate;
// the flag is a quality signal for v2 prompt tuning.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/require-admin';

const FlagSchema = z.object({ reason: z.string().max(500).optional() });

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = FlagSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { data, error } = await auth.admin
    .from('client_analytics_pulses')
    .update({
      flagged_wrong_at: new Date().toISOString(),
      flagged_wrong_by: auth.userId,
      flagged_wrong_reason: parsed.data.reason ?? null,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[pulse/flag-wrong] update error', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
