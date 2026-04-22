import { NextRequest, NextResponse } from 'next/server';
import { requireOnboardingAdmin } from '@/lib/onboarding/require-admin';

/**
 * POST /api/onboarding/trackers/[id]/duplicate
 *
 * Clones a tracker (real or template) along with its phases + groups +
 * items. Result matches the kind of the source:
 *   - real tracker  → new real tracker, same client_id, title "X (copy)"
 *   - template      → new template,     no client_id,   name  "X (copy)"
 *
 * If a real tracker already exists for (client_id, service) — the DB
 * has a partial unique index — the duplicate lands without a client_id
 * reference won't collide, but a real-duplicate IS blocked. We surface
 * the DB error plainly in that case so admins understand.
 *
 * Partial-failure rollback: if any child copy fails, we delete the
 * freshly-created parent to avoid orphans.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sourceId } = await params;
    const gate = await requireOnboardingAdmin();
    if (gate.error) return gate.error;
    const { admin, userId } = gate;

    const { data: source, error: srcErr } = await admin
      .from('onboarding_trackers')
      .select('id, client_id, service, title, template_name, is_template, status')
      .eq('id', sourceId)
      .maybeSingle();
    if (srcErr || !source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    // Build the new row, branching on kind.
    const baseInsert = {
      service: source.service,
      is_template: source.is_template,
      created_by: userId,
      // Real trackers inherit paused so a duplicate doesn't look like
      // a concurrent active run. Templates stay active (their status
      // is meaningless on templates anyway).
      status: source.is_template ? source.status : 'paused',
    };
    const insertRow = source.is_template
      ? {
          ...baseInsert,
          client_id: null,
          template_name: `${source.template_name ?? 'Template'} (copy)`,
        }
      : {
          ...baseInsert,
          client_id: source.client_id,
          title: `${source.title ?? 'Onboarding'} (copy)`,
        };

    const { data: inserted, error: insErr } = await admin
      .from('onboarding_trackers')
      .insert(insertRow)
      .select('id')
      .single();
    if (insErr || !inserted) {
      console.error('duplicate tracker insert error:', insErr);
      // Surface unique-constraint collisions explicitly.
      const msg = insErr?.message?.includes('unique')
        ? `A tracker already exists for this client + ${source.service}. Archive or delete it first.`
        : 'Failed to duplicate tracker';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Copy phases and checklist (shape identical to save-as-template).
    const [{ data: srcPhases }, { data: srcGroups }] = await Promise.all([
      admin
        .from('onboarding_phases')
        .select('name, description, what_we_need, status, sort_order, actions, progress_percent')
        .eq('tracker_id', sourceId)
        .order('sort_order', { ascending: true }),
      admin
        .from('onboarding_checklist_groups')
        .select('id, name, sort_order')
        .eq('tracker_id', sourceId)
        .order('sort_order', { ascending: true }),
    ]);

    if (srcPhases && srcPhases.length > 0) {
      const { error } = await admin.from('onboarding_phases').insert(
        srcPhases.map((p) => ({
          tracker_id: inserted.id,
          name: p.name,
          description: p.description,
          what_we_need: p.what_we_need,
          status: p.status,
          sort_order: p.sort_order,
          actions: p.actions ?? [],
          progress_percent: p.progress_percent,
        })),
      );
      if (error) {
        console.error('duplicate phases error:', error);
        await admin.from('onboarding_trackers').delete().eq('id', inserted.id);
        return NextResponse.json({ error: 'Failed to copy phases' }, { status: 500 });
      }
    }

    if (srcGroups && srcGroups.length > 0) {
      const { data: newGroups, error: gErr } = await admin
        .from('onboarding_checklist_groups')
        .insert(
          srcGroups.map((g) => ({
            tracker_id: inserted.id,
            name: g.name,
            sort_order: g.sort_order,
          })),
        )
        .select('id, sort_order');
      if (gErr || !newGroups) {
        console.error('duplicate groups error:', gErr);
        await admin.from('onboarding_trackers').delete().eq('id', inserted.id);
        return NextResponse.json({ error: 'Failed to copy sections' }, { status: 500 });
      }
      const newByOld = new Map<string, string>();
      srcGroups.forEach((g, i) => {
        const n = newGroups[i];
        if (n) newByOld.set(g.id, n.id);
      });

      const oldGroupIds = srcGroups.map((g) => g.id);
      const { data: srcItems } = await admin
        .from('onboarding_checklist_items')
        .select('group_id, task, description, owner, status, sort_order')
        .in('group_id', oldGroupIds)
        .order('sort_order', { ascending: true });

      if (srcItems && srcItems.length > 0) {
        const itemInserts = srcItems
          .map((it) => {
            const gid = newByOld.get(it.group_id);
            if (!gid) return null;
            return {
              group_id: gid,
              task: it.task,
              description: it.description,
              owner: it.owner,
              status: it.status,
              sort_order: it.sort_order,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        if (itemInserts.length > 0) {
          const { error } = await admin
            .from('onboarding_checklist_items')
            .insert(itemInserts);
          if (error) {
            console.error('duplicate items error:', error);
            await admin.from('onboarding_trackers').delete().eq('id', inserted.id);
            return NextResponse.json({ error: 'Failed to copy tasks' }, { status: 500 });
          }
        }
      }
    }

    return NextResponse.json({ tracker_id: inserted.id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/onboarding/trackers/[id]/duplicate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
