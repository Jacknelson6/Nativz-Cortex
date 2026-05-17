import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import {
  appendHistory,
  canTransition,
  type HandoffHistoryEntry,
  type HandoffState,
} from '@/lib/calendar/handoff-state';

const RequestSchema = z.object({
  note: z.string().min(1).max(2000),
  targetState: z.enum(['editing', 'smm_rejected']).optional().default('smm_rejected'),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid request', detail: err instanceof Error ? err.message : 'parse error' },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .select('id, handoff_state, handoff_history')
    .eq('id', id)
    .single<{
      id: string;
      handoff_state: HandoffState;
      handoff_history: HandoffHistoryEntry[] | null;
    }>();
  if (dropErr || !drop) {
    return NextResponse.json({ error: 'drop not found' }, { status: 404 });
  }

  const currentState = drop.handoff_state;
  if (currentState !== 'smm_review' && currentState !== 'smm_approved') {
    return NextResponse.json(
      {
        error: 'invalid transition',
        handoff_state: currentState,
        hint:
          currentState === 'client_sent'
            ? 'this drop has already been sent to the client and cannot be rejected'
            : currentState === 'editing'
              ? 'editor has not handed this drop off yet'
              : `cannot reject a drop in state ${currentState}`,
      },
      { status: 409 },
    );
  }

  const targetState: HandoffState = body.targetState;
  if (!canTransition(currentState, targetState)) {
    return NextResponse.json(
      { error: 'invalid transition', handoff_state: currentState, target: targetState },
      { status: 409 },
    );
  }

  const newHistory = appendHistory(drop.handoff_history ?? [], {
    state: targetState,
    actor: user.id,
    note: body.note,
  });

  const { error: updateErr } = await admin
    .from('content_drops')
    .update({
      handoff_state: targetState,
      handoff_history: newHistory,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updateErr) {
    return NextResponse.json(
      { error: 'failed to reject drop', detail: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    drop: { id, handoff_state: targetState },
    history: newHistory,
  });
}
