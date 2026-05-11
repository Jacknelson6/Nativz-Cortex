// ZNA-03: admin POST — soft-dismiss today's pulse for the rest of the day.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data, error } = await auth.admin
    .from('client_analytics_pulses')
    .update({
      is_dismissed: true,
      dismissed_at: new Date().toISOString(),
      dismissed_by: auth.userId,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[pulse/dismiss] update error', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
