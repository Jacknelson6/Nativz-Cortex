import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BodySchema = z.object({
  user_id: z.string().uuid(),
});

/**
 * POST /api/onboarding/flows/[id]/stakeholders — attach an admin user
 * as a milestone-notification stakeholder. Snapshot their email +
 * display name + role label at attach time so renders don't re-query.
 *
 * Default notify settings: onboarding_complete = true, the others off.
 * Admin can toggle each individually after add via PATCH.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: flowId } = await ctx.params;
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

  const { data: target } = await admin
    .from('users')
    .select('id, full_name, email, role_title, role, is_super_admin')
    .eq('id', parsed.data.user_id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  // Only allow admins as stakeholders — viewers shouldn't get internal
  // milestone emails by accident.
  const targetIsAdmin = target.role === 'admin' || target.is_super_admin === true;
  if (!targetIsAdmin) {
    return NextResponse.json({ error: 'target user must be an admin' }, { status: 400 });
  }
  if (!target.email) {
    return NextResponse.json({ error: 'target user has no email on file' }, { status: 400 });
  }

  const { data: stakeholder, error } = await admin
    .from('onboarding_flow_stakeholders')
    .insert({
      flow_id: flowId,
      user_id: target.id,
      email: target.email,
      display_name: target.full_name ?? null,
      role_label: target.role_title ?? null,
      notify_on_invoice_paid: false,
      notify_on_segment_completed: false,
      notify_on_onboarding_complete: true,
    })
    .select('*')
    .single();
  if (error || !stakeholder) {
    // Unique violation — they're already attached.
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'already attached' }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, stakeholder });
}
