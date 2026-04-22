import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const Body = z.object({
  template_id: z.string().uuid(),
});

/**
 * POST /api/onboarding/trackers/[id]/apply-template
 *
 * Seeds the target tracker from a template by copying its phases,
 * checklist groups, and items. Appends onto whatever's already there —
 * existing data is never destroyed. sort_order values start after the
 * current max for each collection so the copied content renders below
 * the existing content, in order.
 *
 * Validates that the template is actually `is_template=true` and
 * matches the target tracker's service — applying a "Paid Media"
 * template to a Social tracker is rejected at the API boundary.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: targetTrackerId } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin } = gate;

    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }
    const { template_id } = parsed.data;

    // Fetch target + template in parallel for service compatibility check.
    const [targetRes, templateRes] = await Promise.all([
      admin
        .from('onboarding_trackers')
        .select('id, service, is_template')
        .eq('id', targetTrackerId)
        .maybeSingle(),
      admin
        .from('onboarding_trackers')
        .select('id, service, is_template')
        .eq('id', template_id)
        .maybeSingle(),
    ]);

    if (!targetRes.data) return NextResponse.json({ error: 'Target tracker not found' }, { status: 404 });
    if (!templateRes.data) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    if (targetRes.data.is_template) {
      return NextResponse.json({ error: "Can't apply a template to another template." }, { status: 400 });
    }
    if (!templateRes.data.is_template) {
      return NextResponse.json({ error: 'Source is not a template.' }, { status: 400 });
    }
    if (targetRes.data.service !== templateRes.data.service) {
      return NextResponse.json(
        { error: `Service mismatch: template is for ${templateRes.data.service}, tracker is for ${targetRes.data.service}.` },
        { status: 400 },
      );
    }

    // Load template contents + target's current max sort orders.
    const [tplPhases, tplGroups, targetMaxPhase, targetMaxGroup] = await Promise.all([
      admin
        .from('onboarding_phases')
        .select('name, description, what_we_need, status, sort_order, actions, progress_percent')
        .eq('tracker_id', template_id)
        .order('sort_order', { ascending: true }),
      admin
        .from('onboarding_checklist_groups')
        .select('id, name, sort_order')
        .eq('tracker_id', template_id)
        .order('sort_order', { ascending: true }),
      admin
        .from('onboarding_phases')
        .select('sort_order')
        .eq('tracker_id', targetTrackerId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('onboarding_checklist_groups')
        .select('sort_order')
        .eq('tracker_id', targetTrackerId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const phaseOffset = (targetMaxPhase.data?.sort_order ?? -1) + 1;
    const groupOffset = (targetMaxGroup.data?.sort_order ?? -1) + 1;

    // Insert phases (reset status to not_started — applying a template
    // means "copy the structure, restart the state").
    if (tplPhases.data && tplPhases.data.length > 0) {
      const phaseInserts = tplPhases.data.map((p, i) => ({
        tracker_id: targetTrackerId,
        name: p.name,
        description: p.description,
        what_we_need: p.what_we_need,
        status: 'not_started',
        sort_order: phaseOffset + i,
        actions: p.actions ?? [],
        progress_percent: p.progress_percent,
      }));
      const { error } = await admin.from('onboarding_phases').insert(phaseInserts);
      if (error) throw error;
    }

    // Groups + their items. Items carry a group_id FK so insert groups
    // first, then read back their new IDs and insert items keyed to them.
    const newGroupByOldId = new Map<string, string>();
    if (tplGroups.data && tplGroups.data.length > 0) {
      const groupInserts = tplGroups.data.map((g, i) => ({
        tracker_id: targetTrackerId,
        name: g.name,
        sort_order: groupOffset + i,
      }));
      const { data: insertedGroups, error } = await admin
        .from('onboarding_checklist_groups')
        .insert(groupInserts)
        .select('id, sort_order');
      if (error) throw error;

      // Align inserted groups to template groups by index (order
      // preserved by sort_order insert sequence).
      tplGroups.data.forEach((g, i) => {
        const inserted = insertedGroups?.[i];
        if (inserted) newGroupByOldId.set(g.id, inserted.id);
      });

      // Pull template items for all groups, then rewrite group_id.
      const oldGroupIds = tplGroups.data.map((g) => g.id);
      const { data: tplItems, error: itemsErr } = await admin
        .from('onboarding_checklist_items')
        .select('group_id, task, description, owner, sort_order')
        .in('group_id', oldGroupIds)
        .order('sort_order', { ascending: true });
      if (itemsErr) throw itemsErr;

      if (tplItems && tplItems.length > 0) {
        const itemInserts = tplItems
          .map((it) => {
            const newGroupId = newGroupByOldId.get(it.group_id);
            if (!newGroupId) return null;
            return {
              group_id: newGroupId,
              task: it.task,
              description: it.description,
              owner: it.owner,
              status: 'pending',
              sort_order: it.sort_order,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        if (itemInserts.length > 0) {
          const { error } = await admin.from('onboarding_checklist_items').insert(itemInserts);
          if (error) throw error;
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/onboarding/trackers/[id]/apply-template error:', error);
    return NextResponse.json({ error: 'Failed to apply template' }, { status: 500 });
  }
}
