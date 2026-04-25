import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createFlowForClient } from '@/lib/onboarding/flows';

const BodySchema = z.object({
  clientId: z.string().uuid(),
});

/**
 * POST /api/onboarding/flows — Admin starts an onboarding flow for a
 * client. Idempotent: if a live (non-archived/completed) flow already
 * exists for the client, we return it instead of erroring. The persistent
 * "Start onboarding" toast surfaces from `getPendingFlowToastsForUser`
 * until the admin attaches a proposal or dismisses the toast.
 */
export async function POST(req: NextRequest) {
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

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad body' }, { status: 400 });
  }

  const result = await createFlowForClient({
    clientId: parsed.data.clientId,
    createdBy: user.id,
    admin,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    flowId: result.flow.id,
    existing: result.existing,
    status: result.flow.status,
    shareToken: result.flow.share_token,
  });
}
