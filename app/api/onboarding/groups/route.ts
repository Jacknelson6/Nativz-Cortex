import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const CreateBody = z.object({
  tracker_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

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
      .from('onboarding_checklist_groups')
      .select('sort_order')
      .eq('tracker_id', parsed.data.tracker_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSort = (maxRow?.sort_order ?? -1) + 1;

    const { data, error } = await admin
      .from('onboarding_checklist_groups')
      .insert({
        tracker_id: parsed.data.tracker_id,
        name: parsed.data.name,
        sort_order: nextSort,
      })
      .select('id, tracker_id, name, sort_order')
      .single();

    if (error) {
      console.error('POST /api/onboarding/groups error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ group: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/onboarding/groups error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
