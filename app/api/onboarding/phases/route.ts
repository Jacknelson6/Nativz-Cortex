import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const ActionSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().url(),
  variant: z.enum(['primary', 'secondary']).optional(),
});

const CreateBody = z.object({
  tracker_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  what_we_need: z.string().trim().max(500).optional(),
  actions: z.array(ActionSchema).max(4).optional(),
  progress_percent: z.number().int().min(0).max(100).nullable().optional(),
});

/**
 * POST /api/onboarding/phases
 * Add a new timeline phase to a tracker. Appends at the end of the
 * existing sort order.
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const parsed = CreateBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }

    const { data: maxRow } = await admin
      .from('onboarding_phases')
      .select('sort_order')
      .eq('tracker_id', parsed.data.tracker_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSort = (maxRow?.sort_order ?? -1) + 1;

    const { data, error } = await admin
      .from('onboarding_phases')
      .insert({
        tracker_id: parsed.data.tracker_id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        what_we_need: parsed.data.what_we_need ?? null,
        actions: parsed.data.actions ?? [],
        progress_percent: parsed.data.progress_percent ?? null,
        sort_order: nextSort,
      })
      .select('id, tracker_id, name, description, what_we_need, status, sort_order, actions, progress_percent')
      .single();

    if (error) {
      console.error('POST /api/onboarding/phases error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ phase: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/onboarding/phases error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
