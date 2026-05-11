// ZNA-03: admin POST — toggle pulse lock. When locked, the cron skips
// the client for that day. Auto-releases at next UTC midnight by virtue
// of the row being pulse_date-scoped.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/require-admin';

const LockSchema = z.object({ locked: z.boolean() });

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = LockSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const update = parsed.data.locked
    ? { is_locked: true, locked_at: new Date().toISOString(), locked_by: auth.userId }
    : { is_locked: false, locked_at: null, locked_by: null };

  const { data, error } = await auth.admin
    .from('client_analytics_pulses')
    .update(update)
    .eq('id', id)
    .select('id, is_locked')
    .maybeSingle();

  if (error) {
    console.error('[pulse/lock] update error', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, is_locked: data.is_locked });
}
