// SPY-01 T10: GET + PATCH /api/prospects/[id]
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/prospects/auth';
import { getProspect } from '@/lib/prospects/queries';
import { LIFECYCLE_STATES, type ProspectLifecycleState } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await getProspect(id);
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(result);
}

const PatchSchema = z.object({
  lifecycle_state: z.enum(LIFECYCLE_STATES as [string, ...string[]]).optional(),
  brand_name: z.string().min(1).optional(),
  website_url: z.string().url().nullable().optional(),
  niche: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  archived_at: z.union([z.string().datetime(), z.null()]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { admin, userId } = auth;
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  // Look up prior state for state-change touchpoint
  const { data: prior } = await admin
    .from('prospects')
    .select('lifecycle_state')
    .eq('id', id)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: updated, error } = await admin
    .from('prospects')
    .update(parsed.data)
    .eq('id', id)
    .select('*')
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });
  }

  // If lifecycle_state changed, write a state_change touchpoint.
  const priorState = (prior as { lifecycle_state: ProspectLifecycleState }).lifecycle_state;
  if (parsed.data.lifecycle_state && parsed.data.lifecycle_state !== priorState) {
    await admin.from('prospect_touchpoints').insert({
      prospect_id: id,
      kind: 'state_change',
      body: `State changed: ${priorState} → ${parsed.data.lifecycle_state}`,
      metadata: { from_state: priorState, to_state: parsed.data.lifecycle_state },
      created_by: userId,
    });
  }

  return NextResponse.json({ prospect: updated });
}
