import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const Body = z.object({
  tracker_id: z.string().uuid(),
  order: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * POST /api/onboarding/phases/reorder
 *
 * Commits a new phase order after a drag-drop. Accepts `order` — the full
 * ordered array of phase ids — and rewrites `sort_order` to 0..N-1 in that
 * sequence.
 *
 * We refetch the tracker's actual phase ids first and drop any strays
 * in the request (so a malformed client can't overwrite phases on a
 * different tracker). The write is a parallel batch of one-row UPDATEs
 * because Supabase doesn't expose per-row batch updates with distinct
 * values.
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
    const { tracker_id, order } = parsed.data;

    // Fence: only phases that actually belong to this tracker.
    const { data: existing, error: readErr } = await admin
      .from('onboarding_phases')
      .select('id')
      .eq('tracker_id', tracker_id);
    if (readErr) {
      console.error('reorder phases read error:', readErr);
      return NextResponse.json({ error: 'Failed to read phases' }, { status: 500 });
    }
    const valid = new Set((existing ?? []).map((r) => r.id));
    const filtered = order.filter((id) => valid.has(id));

    await Promise.all(
      filtered.map((id, idx) =>
        admin.from('onboarding_phases').update({ sort_order: idx }).eq('id', id),
      ),
    );

    return NextResponse.json({ success: true, count: filtered.length });
  } catch (error) {
    console.error('POST /api/onboarding/phases/reorder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
