import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

const Body = z.object({
  template_name: z.string().trim().min(1).max(120),
});

/**
 * POST /api/onboarding/trackers/[id]/save-as-template
 *
 * Snapshots the source tracker's phases + checklist into a new
 * `is_template=true` tracker with the same service. The source tracker
 * is unchanged. Useful after an admin has hand-tuned a client's
 * onboarding and wants to reuse the shape for future clients.
 *
 * We persist the source's CURRENT status values too, because sometimes
 * admins want "pre-completed setup steps" in a template. Easy to reset
 * manually after the save.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sourceTrackerId } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin, userId } = gate;

    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }
    const { template_name } = parsed.data;

    const { data: source } = await admin
      .from('onboarding_trackers')
      .select('id, service, is_template')
      .eq('id', sourceTrackerId)
      .maybeSingle();
    if (!source) {
      return NextResponse.json({ error: 'Source tracker not found' }, { status: 404 });
    }
    if (source.is_template) {
      return NextResponse.json({ error: "Can't save a template as another template." }, { status: 400 });
    }

    // Create the template tracker.
    const { data: tpl, error: tplErr } = await admin
      .from('onboarding_trackers')
      .insert({
        client_id: null,
        service: source.service,
        template_name,
        is_template: true,
        created_by: userId,
      })
      .select('id')
      .single();
    if (tplErr || !tpl) {
      console.error('save-as-template insert template error:', tplErr);
      return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }

    // Copy phases, then groups + their items.
    const [{ data: srcPhases }, { data: srcGroups }] = await Promise.all([
      admin
        .from('onboarding_phases')
        .select('name, description, what_we_need, status, sort_order, actions, progress_percent')
        .eq('tracker_id', sourceTrackerId)
        .order('sort_order', { ascending: true }),
      admin
        .from('onboarding_checklist_groups')
        .select('id, name, sort_order')
        .eq('tracker_id', sourceTrackerId)
        .order('sort_order', { ascending: true }),
    ]);

    if (srcPhases && srcPhases.length > 0) {
      const phaseInserts = srcPhases.map((p) => ({
        tracker_id: tpl.id,
        name: p.name,
        description: p.description,
        what_we_need: p.what_we_need,
        status: p.status,
        sort_order: p.sort_order,
        actions: p.actions ?? [],
        progress_percent: p.progress_percent,
      }));
      const { error } = await admin.from('onboarding_phases').insert(phaseInserts);
      if (error) {
        console.error('save-as-template phases error:', error);
        // Tracker is orphaned w/o children — rollback.
        await admin.from('onboarding_trackers').delete().eq('id', tpl.id);
        return NextResponse.json({ error: 'Failed to copy phases' }, { status: 500 });
      }
    }

    if (srcGroups && srcGroups.length > 0) {
      const groupInserts = srcGroups.map((g) => ({
        tracker_id: tpl.id,
        name: g.name,
        sort_order: g.sort_order,
      }));
      const { data: insertedGroups, error: gErr } = await admin
        .from('onboarding_checklist_groups')
        .insert(groupInserts)
        .select('id, sort_order');
      if (gErr || !insertedGroups) {
        console.error('save-as-template groups error:', gErr);
        await admin.from('onboarding_trackers').delete().eq('id', tpl.id);
        return NextResponse.json({ error: 'Failed to copy groups' }, { status: 500 });
      }

      const newGroupByOldId = new Map<string, string>();
      srcGroups.forEach((g, i) => {
        const inserted = insertedGroups[i];
        if (inserted) newGroupByOldId.set(g.id, inserted.id);
      });

      const oldGroupIds = srcGroups.map((g) => g.id);
      const { data: srcItems, error: iErr } = await admin
        .from('onboarding_checklist_items')
        .select('group_id, task, description, owner, status, sort_order')
        .in('group_id', oldGroupIds)
        .order('sort_order', { ascending: true });
      if (iErr) {
        console.error('save-as-template items read error:', iErr);
        await admin.from('onboarding_trackers').delete().eq('id', tpl.id);
        return NextResponse.json({ error: 'Failed to read items' }, { status: 500 });
      }

      if (srcItems && srcItems.length > 0) {
        const itemInserts = srcItems
          .map((it) => {
            const newGroupId = newGroupByOldId.get(it.group_id);
            if (!newGroupId) return null;
            return {
              group_id: newGroupId,
              task: it.task,
              description: it.description,
              owner: it.owner,
              status: it.status,
              sort_order: it.sort_order,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        if (itemInserts.length > 0) {
          const { error } = await admin.from('onboarding_checklist_items').insert(itemInserts);
          if (error) {
            console.error('save-as-template items insert error:', error);
            await admin.from('onboarding_trackers').delete().eq('id', tpl.id);
            return NextResponse.json({ error: 'Failed to copy items' }, { status: 500 });
          }
        }
      }
    }

    return NextResponse.json({ template_id: tpl.id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/onboarding/trackers/[id]/save-as-template error:', error);
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 });
  }
}
