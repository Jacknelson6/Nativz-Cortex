/**
 * Promote a client out of onboarding: mark every active/paused onboarding
 * tracker as `completed` and set `clients.agency` to the target value in
 * one transactional call.
 *
 * Called by the clients Kanban when a card is dragged from the Onboarding
 * column to an agency column.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BodySchema = z.object({
  agency: z.string().min(1).nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const { agency } = parsed.data;

  // 1. Close out any active/paused trackers for this client.
  const nowIso = new Date().toISOString();
  const { error: trackerErr, count: trackerCount } = await admin
    .from('onboarding_trackers')
    .update({ status: 'completed', completed_at: nowIso }, { count: 'exact' })
    .eq('client_id', id)
    .in('status', ['active', 'paused']);

  if (trackerErr) {
    return NextResponse.json({ error: trackerErr.message }, { status: 500 });
  }

  // 2. Set the client's target agency.
  const { error: clientErr } = await admin
    .from('clients')
    .update({ agency })
    .eq('id', id);

  if (clientErr) {
    return NextResponse.json({ error: clientErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    completed_trackers: trackerCount ?? 0,
    agency,
  });
}
