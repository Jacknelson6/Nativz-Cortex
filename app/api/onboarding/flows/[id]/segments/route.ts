import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scaffoldSegmentTracker } from '@/lib/onboarding/segment-templates';

const BodySchema = z.object({
  kind: z.enum(['social', 'paid_media', 'web']),
});

/**
 * POST /api/onboarding/flows/[id]/segments — admin adds a service segment.
 *
 * Each non-virtual segment kind has a starter tracker template
 * (lib/onboarding/segment-templates.ts) that scaffolds the
 * onboarding_trackers row + phases + checklist groups + items.
 * The flow_segments junction is then created pointing at the new tracker.
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
  const { kind } = parsed.data;

  // Resolve flow + client.
  const { data: flow } = await admin
    .from('onboarding_flows')
    .select('id, client_id')
    .eq('id', flowId)
    .maybeSingle();
  if (!flow) return NextResponse.json({ error: 'flow not found' }, { status: 404 });

  // Determine next position for ordering.
  const { data: existing } = await admin
    .from('onboarding_flow_segments')
    .select('position')
    .eq('flow_id', flowId);
  const nextPosition = ((existing ?? []) as Array<{ position: number }>).reduce(
    (m, r) => Math.max(m, r.position),
    -1,
  ) + 1;

  // Scaffold the tracker for this segment kind.
  const scaffold = await scaffoldSegmentTracker({
    admin,
    clientId: flow.client_id,
    kind,
    createdBy: user.id,
  });
  if (!scaffold.ok) {
    return NextResponse.json({ error: scaffold.error }, { status: 500 });
  }

  // Insert the junction row.
  const { data: segment, error: segErr } = await admin
    .from('onboarding_flow_segments')
    .insert({
      flow_id: flowId,
      kind,
      tracker_id: scaffold.trackerId,
      position: nextPosition,
      status: 'pending',
    })
    .select('id, kind, tracker_id, position, status, started_at, completed_at')
    .single();
  if (segErr || !segment) {
    return NextResponse.json({ error: segErr?.message ?? 'insert failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    segment: {
      ...segment,
      tracker_title: scaffold.title ?? null,
      tracker_service: kind,
      item_total: scaffold.itemCount,
      item_done: 0,
    },
  });
}
