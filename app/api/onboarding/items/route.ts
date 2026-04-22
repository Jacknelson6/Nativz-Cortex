import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const CreateBody = z.object({
  group_id: z.string().uuid(),
  task: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional(),
  owner: z.enum(['agency', 'client']).optional(),
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
      .from('onboarding_checklist_items')
      .select('sort_order')
      .eq('group_id', parsed.data.group_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSort = (maxRow?.sort_order ?? -1) + 1;

    const { data, error } = await admin
      .from('onboarding_checklist_items')
      .insert({
        group_id: parsed.data.group_id,
        task: parsed.data.task,
        description: parsed.data.description ?? null,
        owner: parsed.data.owner ?? 'agency',
        sort_order: nextSort,
      })
      .select('id, group_id, task, description, owner, status, sort_order')
      .single();

    if (error) {
      console.error('POST /api/onboarding/items error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/onboarding/items error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
