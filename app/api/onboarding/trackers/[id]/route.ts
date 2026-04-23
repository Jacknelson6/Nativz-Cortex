import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const PatchBody = z.object({
  title: z.string().trim().max(120).nullable().optional(),
  status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  notify_emails: z.array(z.string().trim().email()).max(20).optional(),
  // Regenerate share token — clears the old one.
  regenerate_share_token: z.boolean().optional(),
}).refine(
  (b) => Object.keys(b).length > 0,
  { message: 'At least one field required' },
);

/**
 * GET /api/onboarding/trackers/[id]
 * Full tracker + phases + groups + items for the admin editor.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    // Fetch tracker + children in parallel.
    const [trackerRes, phasesRes, groupsRes] = await Promise.all([
      admin
        .from('onboarding_trackers')
        .select('id, client_id, service, title, status, share_token, started_at, completed_at, created_at, updated_at, clients!inner(name, slug, logo_url)')
        .eq('id', id)
        .single(),
      admin
        .from('onboarding_phases')
        .select('id, tracker_id, name, description, what_we_need, status, sort_order, actions, progress_percent')
        .eq('tracker_id', id)
        .order('sort_order', { ascending: true }),
      admin
        .from('onboarding_checklist_groups')
        .select('id, tracker_id, name, sort_order')
        .eq('tracker_id', id)
        .order('sort_order', { ascending: true }),
    ]);

    if (trackerRes.error || !trackerRes.data) {
      return NextResponse.json({ error: 'Tracker not found' }, { status: 404 });
    }

    // Items fetched after groups so we can filter by the real group IDs.
    const groupIds = (groupsRes.data ?? []).map((g) => g.id);
    const { data: items } = groupIds.length
      ? await admin
          .from('onboarding_checklist_items')
          .select('id, group_id, task, description, owner, status, sort_order')
          .in('group_id', groupIds)
          .order('sort_order', { ascending: true })
      : { data: [] };

    return NextResponse.json({
      tracker: trackerRes.data,
      phases: phasesRes.data ?? [],
      groups: groupsRes.data ?? [],
      items: items ?? [],
    });
  } catch (error) {
    console.error('GET /api/onboarding/trackers/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/onboarding/trackers/[id]
 * Update status, title, timestamps, or rotate the share token.
 */
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

    const updates: Record<string, unknown> = {};
    for (const key of ['title', 'status', 'started_at', 'completed_at', 'notify_emails'] as const) {
      if (key in parsed.data) updates[key] = parsed.data[key];
    }
    if (parsed.data.regenerate_share_token) {
      // Use crypto.randomUUID to avoid another DB round-trip.
      updates.share_token = crypto.randomUUID();
    }

    const { data, error } = await admin
      .from('onboarding_trackers')
      .update(updates)
      .eq('id', id)
      .select('id, client_id, service, title, status, share_token, notify_emails, started_at, completed_at, created_at, updated_at')
      .single();

    if (error) {
      console.error('PATCH /api/onboarding/trackers/[id] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ tracker: data });
  } catch (error) {
    console.error('PATCH /api/onboarding/trackers/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/onboarding/trackers/[id]
 * Cascade deletes phases, groups, and items via FK ON DELETE CASCADE.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const { error } = await admin.from('onboarding_trackers').delete().eq('id', id);
    if (error) {
      console.error('DELETE /api/onboarding/trackers/[id] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/onboarding/trackers/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
