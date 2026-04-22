import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const Body = z.object({
  group_id: z.string().uuid(),
  order: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * POST /api/onboarding/items/reorder
 *
 * Commits new checklist-item order after a drag-drop. Same shape as the
 * phases reorder route but scoped by `group_id`. We only touch items that
 * actually belong to the named group, so a stale or malicious id can't
 * trample an item in another group.
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }
    const { group_id, order } = parsed.data;

    const { data: existing, error: readErr } = await admin
      .from('onboarding_checklist_items')
      .select('id')
      .eq('group_id', group_id);
    if (readErr) {
      console.error('reorder items read error:', readErr);
      return NextResponse.json({ error: 'Failed to read items' }, { status: 500 });
    }
    const valid = new Set((existing ?? []).map((r) => r.id));
    const filtered = order.filter((id) => valid.has(id));

    await Promise.all(
      filtered.map((id, idx) =>
        admin.from('onboarding_checklist_items').update({ sort_order: idx }).eq('id', id),
      ),
    );

    return NextResponse.json({ success: true, count: filtered.length });
  } catch (error) {
    console.error('POST /api/onboarding/items/reorder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
