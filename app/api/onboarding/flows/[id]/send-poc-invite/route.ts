import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendFlowPocInvite } from '@/lib/onboarding/system-emails';

/**
 * POST /api/onboarding/flows/[id]/send-poc-invite — manual fallback for the
 * automated POC invite that fires on `proposal.paid`. Admin can re-fire if
 * the proposal-paid send failed (Resend hiccup, missing API key at the
 * time, etc.).
 */
export async function POST(
  _req: Request,
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

  const { data: flow } = await admin
    .from('onboarding_flows')
    .select('id, status, poc_emails')
    .eq('id', flowId)
    .maybeSingle();
  if (!flow) return NextResponse.json({ error: 'flow not found' }, { status: 404 });
  if (flow.status !== 'active') {
    return NextResponse.json(
      { error: 'flow is not active yet — POC invite blocked until proposal is paid' },
      { status: 409 },
    );
  }
  const recipients = ((flow.poc_emails as string[] | null) ?? []).length;
  if (!recipients) {
    return NextResponse.json({ error: 'no POC emails configured' }, { status: 400 });
  }

  await sendFlowPocInvite(admin, flowId);
  return NextResponse.json({ ok: true, sent: recipients });
}
