import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const ActionSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().url(),
  variant: z.enum(['primary', 'secondary']).optional(),
});

const PatchBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  what_we_need: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['not_started', 'in_progress', 'done']).optional(),
  sort_order: z.number().int().min(0).optional(),
  actions: z.array(ActionSchema).max(4).optional(),
  progress_percent: z.number().int().min(0).max(100).nullable().optional(),
}).refine(
  (b) => Object.keys(b).length > 0,
  { message: 'At least one field required' },
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const parsed = PatchBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('onboarding_phases')
      .update(parsed.data)
      .eq('id', id)
      .select('id, tracker_id, name, description, what_we_need, status, sort_order, actions, progress_percent')
      .single();

    if (error) {
      console.error('PATCH /api/onboarding/phases/[id] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Cascade: when a phase moves to 'done' and every sibling phase is now
    // done too, auto-mark the tracker as completed so the admin doesn't
    // have to remember. Only touches non-template trackers that aren't
    // already completed/archived.
    if (parsed.data.status === 'done' && data) {
      const [{ data: siblings }, { data: tracker }] = await Promise.all([
        admin
          .from('onboarding_phases')
          .select('status')
          .eq('tracker_id', data.tracker_id),
        admin
          .from('onboarding_trackers')
          .select('id, status, is_template, completed_at')
          .eq('id', data.tracker_id)
          .maybeSingle(),
      ]);
      const allDone = (siblings ?? []).length > 0 && (siblings ?? []).every((p) => p.status === 'done');
      const shouldComplete = allDone && tracker && !tracker.is_template && tracker.status === 'active';
      if (shouldComplete) {
        await admin
          .from('onboarding_trackers')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', data.tracker_id);
      }
    }

    return NextResponse.json({ phase: data });
  } catch (error) {
    console.error('PATCH /api/onboarding/phases/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const { error } = await admin.from('onboarding_phases').delete().eq('id', id);
    if (error) {
      console.error('DELETE /api/onboarding/phases/[id] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/onboarding/phases/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
