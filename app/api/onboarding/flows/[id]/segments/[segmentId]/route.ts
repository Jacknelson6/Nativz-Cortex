import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * DELETE /api/onboarding/flows/[id]/segments/[segmentId] — remove a
 * service segment. Cascades: the junction row + the underlying tracker
 * (and its checklist groups/items + phases via FK CASCADE).
 *
 * The agreement_payment segment is virtual and cannot be removed.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; segmentId: string }> },
) {
  const { id: flowId, segmentId } = await ctx.params;
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

  const { data: seg } = await admin
    .from('onboarding_flow_segments')
    .select('id, kind, tracker_id')
    .eq('id', segmentId)
    .eq('flow_id', flowId)
    .maybeSingle();
  if (!seg) return NextResponse.json({ error: 'segment not found' }, { status: 404 });
  if (seg.kind === 'agreement_payment') {
    return NextResponse.json({ error: 'agreement segment cannot be removed' }, { status: 400 });
  }

  const { error: segErr } = await admin
    .from('onboarding_flow_segments')
    .delete()
    .eq('id', segmentId);
  if (segErr) return NextResponse.json({ error: segErr.message }, { status: 500 });

  if (seg.tracker_id) {
    await admin.from('onboarding_trackers').delete().eq('id', seg.tracker_id);
  }

  return NextResponse.json({ ok: true });
}
