import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { provisionPortalInviteForEmail, type PortalInviteRecord } from '@/lib/onboarding/provision-portal-invite';
import { checkAndFlipFlowCompletion } from '@/lib/onboarding/check-completion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/onboard/[token]/items/[itemId]
 *
 * Public, share-token-gated mutation for the new blueprint-based onboarding
 * intake form. Updates the item's status, data jsonb, and dont_have toggle in
 * one shot — kind-aware payloads (drive_link.url, email_list.emails, oauth_socials.platform)
 * are merged into existing data rather than replacing it.
 *
 * Security: validates the token resolves to a flow, the itemId belongs to a
 * group whose tracker is referenced by one of that flow's segments, and the
 * item is client-owned. Agency-owned items reject (clients shouldn't tick
 * tasks the team hasn't done yet).
 *
 * Side-effect: when an oauth_socials item flips dont_have=true, spawns a
 * partner agency_followup item in the same group asking the team to create
 * the social account. Idempotent via item.data.agency_followup_item_id.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  status: z.enum(['pending', 'done']).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  dont_have: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ token: string; itemId: string }> },
) {
  try {
    return await handlePatch(req, ctx);
  } catch (err) {
    console.error('[onboard:item-patch] uncaught', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handlePatch(
  req: NextRequest,
  ctx: { params: Promise<{ token: string; itemId: string }> },
) {
  const { token, itemId } = await ctx.params;
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }
  if (!UUID_RE.test(itemId)) {
    return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const patch = parsed.data;

  const admin = createAdminClient();

  const { data: flow } = await admin
    .from('onboarding_flows')
    .select('id, status, client_id')
    .eq('share_token', token)
    .maybeSingle();
  if (!flow || flow.status === 'archived') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: item } = await admin
    .from('onboarding_checklist_items')
    .select(
      'id, group_id, owner, kind, status, data, dont_have, task, template_key, sort_order, onboarding_checklist_groups!inner(tracker_id)',
    )
    .eq('id', itemId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (item.owner !== 'client') {
    return NextResponse.json({ error: 'Agency-owned task' }, { status: 403 });
  }

  const groupTracker = (item as { onboarding_checklist_groups: { tracker_id: string } | { tracker_id: string }[] })
    .onboarding_checklist_groups;
  const trackerId = Array.isArray(groupTracker) ? groupTracker[0]?.tracker_id : groupTracker?.tracker_id;
  if (!trackerId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: segmentMatch } = await admin
    .from('onboarding_flow_segments')
    .select('id')
    .eq('flow_id', flow.id)
    .eq('tracker_id', trackerId)
    .maybeSingle();
  if (!segmentMatch) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const existingData = (item.data as Record<string, unknown>) ?? {};
  let mergedData = patch.data ? { ...existingData, ...patch.data } : existingData;

  // email_list provisioning: when client adds emails, mint portal invites for
  // the newly-added ones (idempotent via data.invites). Existing invites stay.
  if (item.kind === 'email_list' && patch.data && Array.isArray((patch.data as { emails?: unknown }).emails)) {
    const newEmails = ((patch.data as { emails: unknown[] }).emails)
      .filter((e): e is string => typeof e === 'string')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    const existingInvites = Array.isArray(existingData.invites)
      ? (existingData.invites as PortalInviteRecord[])
      : [];
    const alreadyInvited = new Set(existingInvites.map((i) => i.email.toLowerCase()));
    const toInvite = newEmails.filter((e) => !alreadyInvited.has(e));

    if (toInvite.length > 0 && flow.client_id) {
      const created = await Promise.all(
        toInvite.map((email) =>
          provisionPortalInviteForEmail({ admin, clientId: flow.client_id as string, email }),
        ),
      );
      const successful = created.filter((r): r is PortalInviteRecord => 'token' in r);
      const failed = created
        .filter((r): r is { error: string } => 'error' in r)
        .map((r) => r.error);
      if (failed.length > 0) {
        console.warn('[onboard:item-patch] some portal invites failed', { itemId, failed });
      }
      mergedData = {
        ...mergedData,
        invites: [...existingInvites, ...successful],
        provisioned_at: new Date().toISOString(),
      };
    }
  }

  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    update.status = patch.status;
    if (patch.status === 'done') update.submitted_at = new Date().toISOString();
  }
  if (patch.data !== undefined || mergedData !== existingData) {
    update.data = mergedData;
  }
  if (patch.dont_have !== undefined) {
    update.dont_have = patch.dont_have;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, item, flow_status: flow.status });
  }

  const { data: updated, error: updateError } = await admin
    .from('onboarding_checklist_items')
    .update(update)
    .eq('id', itemId)
    .select('id, status, data, dont_have, kind, task, template_key, group_id, sort_order')
    .single();
  if (updateError || !updated) {
    console.error('[onboard:item-patch] update failed', { itemId, flowId: flow.id, error: updateError });
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  // Spawn an agency_followup task if a client just flipped dont_have on an oauth_socials.
  if (
    patch.dont_have === true &&
    item.kind === 'oauth_socials' &&
    !(existingData.agency_followup_item_id as string | undefined)
  ) {
    const platform = (existingData.platform as string | undefined) ?? 'social';
    const { data: spawned } = await admin
      .from('onboarding_checklist_items')
      .insert({
        group_id: item.group_id,
        task: `Create ${platform} account for client`,
        description: 'Client marked "we don\'t have one" — team needs to create + connect this account.',
        owner: 'agency',
        status: 'pending',
        sort_order: item.sort_order + 1,
        kind: 'agency_followup',
        template_key: `${item.template_key ?? 'connect'}_team_create`,
        required: false,
        data: { spawned_by_item_id: itemId, platform },
      })
      .select('id')
      .single();
    if (spawned) {
      await admin
        .from('onboarding_checklist_items')
        .update({ data: { ...mergedData, agency_followup_item_id: spawned.id } })
        .eq('id', itemId);
      (updated as { data: Record<string, unknown> }).data = {
        ...mergedData,
        agency_followup_item_id: spawned.id,
      };
    }
  }

  // Best-effort: bump POC activity cursor (the cron uses this to decide reminders).
  await admin
    .from('onboarding_flows')
    .update({ last_poc_activity_at: new Date().toISOString() })
    .eq('id', flow.id);

  // Recompute completion. Only flips from 'active' → 'completed' when every
  // required client-owned item is done OR dont_have. No-op otherwise.
  const completion = await checkAndFlipFlowCompletion(admin, flow.id);
  const newFlowStatus = completion.status === 'completed' ? 'completed' : flow.status;

  return NextResponse.json({
    ok: true,
    item: updated,
    flow_status: newFlowStatus,
    completion: { satisfied: completion.satisfied, total: completion.totalRequired },
  });
}
