import type { SupabaseClient } from '@supabase/supabase-js';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

/**
 * After a flow flips to 'completed', spin up a cal.com-style kickoff picker
 * for the client. Idempotent — if this flow already has a scheduling event,
 * or no tier-1 (`required`) team member can be mapped to an auth.users row,
 * the call is a noop.
 *
 * Flow:
 *   1. Idempotency: skip if a kickoff event already exists for this flow.
 *   2. Resolve required + optional members from `scheduling_people`:
 *        - tier 1 (active) → 'required'
 *        - tier 2 (active) → 'optional'
 *      Map each person → auth.users.id by their lowercased email.
 *   3. Insert team_scheduling_events + members.
 *   4. If a schedule_meeting checklist item exists in the flow, patch its
 *      data jsonb with the share details (status stays as-is — picking the
 *      slot is what flips it to 'done', wired in the public pick route).
 *   5. Log a 'kickoff.scheduling_created' lifecycle event so the client
 *      portal can surface a "Schedule your kickoff" CTA from the feed.
 */

export type AutoCreateKickoffResult =
  | {
      status: 'created';
      eventId: string;
      shareToken: string;
      shareUrl: string;
      requiredCount: number;
      optionalCount: number;
    }
  | { status: 'skipped'; reason: string };

interface SchedulingPersonRow {
  id: string;
  display_name: string;
  priority_tier: 1 | 2 | 3;
}

interface PersonEmailRow {
  person_id: string;
  email: string;
}

interface ResolvedMember {
  user_id: string;
  email: string;
  display_name: string | null;
  attendance: 'required' | 'optional';
}

export async function autoCreateKickoffEvent(
  admin: SupabaseClient,
  flowId: string,
  clientId: string,
): Promise<AutoCreateKickoffResult> {
  // 1. Idempotency — bail if a scheduling event already covers this flow.
  const { data: existing } = await admin
    .from('team_scheduling_events')
    .select('id')
    .eq('flow_id', flowId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { status: 'skipped', reason: 'scheduling event already exists for flow' };
  }

  // 2. Pull the client (name + agency for branded share URL).
  const { data: client } = await admin
    .from('clients')
    .select('id, name, agency')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) {
    return { status: 'skipped', reason: 'client not found' };
  }

  // 3. Resolve the team — active people in tier 1 (required) or 2 (optional).
  const { data: peopleData } = await admin
    .from('scheduling_people')
    .select('id, display_name, priority_tier')
    .eq('is_active', true)
    .in('priority_tier', [1, 2])
    .order('sort_order', { ascending: true });
  const people = (peopleData ?? []) as SchedulingPersonRow[];
  if (people.length === 0) {
    return { status: 'skipped', reason: 'no active scheduling_people in tier 1 or 2' };
  }

  const personIds = people.map((p) => p.id);
  const { data: emailsData } = await admin
    .from('scheduling_person_emails')
    .select('person_id, email')
    .in('person_id', personIds);
  const personEmails = (emailsData ?? []) as PersonEmailRow[];

  const emailsByPerson = new Map<string, string[]>();
  for (const row of personEmails) {
    const list = emailsByPerson.get(row.person_id) ?? [];
    list.push(row.email);
    emailsByPerson.set(row.person_id, list);
  }

  // Map every known email → users.id (case-insensitive).
  const allEmails = Array.from(
    new Set(personEmails.map((e) => e.email.toLowerCase())),
  );
  if (allEmails.length === 0) {
    return { status: 'skipped', reason: 'no emails attached to scheduling_people' };
  }

  const { data: userRows } = await admin
    .from('users')
    .select('id, email')
    .in('email', allEmails);
  const userByEmail = new Map<string, string>();
  for (const u of userRows ?? []) {
    if (u.email) userByEmail.set((u.email as string).toLowerCase(), u.id as string);
  }

  // First mappable email per person wins. Drop people we can't map.
  const members: ResolvedMember[] = [];
  for (const person of people) {
    const candidates = emailsByPerson.get(person.id) ?? [];
    let mapped: { userId: string; email: string } | null = null;
    for (const candidate of candidates) {
      const uid = userByEmail.get(candidate.toLowerCase());
      if (uid) {
        mapped = { userId: uid, email: candidate };
        break;
      }
    }
    if (!mapped) continue;
    members.push({
      user_id: mapped.userId,
      email: mapped.email,
      display_name: person.display_name,
      attendance: person.priority_tier === 1 ? 'required' : 'optional',
    });
  }

  const requiredMembers = members.filter((m) => m.attendance === 'required');
  if (requiredMembers.length === 0) {
    return {
      status: 'skipped',
      reason: 'no tier-1 (required) members map to an authenticated user',
    };
  }

  // 4. Insert the event.
  const eventName = client.name ? `Kickoff with ${client.name}` : 'Kickoff meeting';
  const { data: eventRow, error: eventErr } = await admin
    .from('team_scheduling_events')
    .insert({
      client_id: clientId,
      flow_id: flowId,
      name: eventName,
      duration_minutes: 30,
      lookahead_days: 14,
      working_start: '09:00',
      working_end: '17:00',
      timezone: 'America/New_York',
      status: 'open',
    })
    .select('id, share_token')
    .single();
  if (eventErr || !eventRow) {
    console.error('[auto-create-kickoff] insert event failed', eventErr);
    return { status: 'skipped', reason: 'event insert failed' };
  }

  // 5. Insert members. Roll back the event if member insert fails — leaving
  //    an empty event would mean clients see a picker with no team to overlay.
  const memberRows = members.map((m) => ({
    event_id: eventRow.id,
    user_id: m.user_id,
    email: m.email,
    display_name: m.display_name,
    attendance: m.attendance,
  }));
  const { error: memberErr } = await admin
    .from('team_scheduling_event_members')
    .insert(memberRows);
  if (memberErr) {
    console.error('[auto-create-kickoff] insert members failed', memberErr);
    await admin.from('team_scheduling_events').delete().eq('id', eventRow.id);
    return { status: 'skipped', reason: 'member insert failed' };
  }

  // 6. Build the branded share URL.
  const agency = getBrandFromAgency((client.agency as string | null) ?? null);
  const shareUrl = `${getCortexAppUrl(agency)}/schedule/${eventRow.share_token}`;

  // 7. If a schedule_meeting item exists in this flow, link it and the
  //    client portal can surface it directly. The pick route already knows
  //    how to flip its status to 'done' on slot pick.
  await linkScheduleMeetingItem(admin, flowId, eventRow.id, eventRow.share_token as string, shareUrl);

  // 8. Log lifecycle so the client feed shows "Schedule your kickoff".
  const requiredNames = requiredMembers
    .map((m) => m.display_name ?? m.email)
    .join(' & ');
  await logLifecycleEvent(
    clientId,
    'kickoff.scheduling_created',
    `Kickoff scheduling link ready — pick a time when ${requiredNames} are free.`,
    {
      metadata: {
        flow_id: flowId,
        scheduling_event_id: eventRow.id,
        share_token: eventRow.share_token,
        share_url: shareUrl,
        required_count: requiredMembers.length,
        optional_count: members.length - requiredMembers.length,
      },
      admin,
    },
  ).catch((err) => console.error('[auto-create-kickoff] lifecycle log failed', err));

  return {
    status: 'created',
    eventId: eventRow.id,
    shareToken: eventRow.share_token as string,
    shareUrl,
    requiredCount: requiredMembers.length,
    optionalCount: members.length - requiredMembers.length,
  };
}

async function linkScheduleMeetingItem(
  admin: SupabaseClient,
  flowId: string,
  eventId: string,
  shareToken: string,
  shareUrl: string,
): Promise<void> {
  const { data: segments } = await admin
    .from('onboarding_flow_segments')
    .select('tracker_id')
    .eq('flow_id', flowId);
  const trackerIds = (segments ?? [])
    .map((s) => s.tracker_id as string | null)
    .filter((id): id is string => !!id);
  if (trackerIds.length === 0) return;

  const { data: groups } = await admin
    .from('onboarding_checklist_groups')
    .select('id')
    .in('tracker_id', trackerIds);
  const groupIds = (groups ?? []).map((g) => g.id as string);
  if (groupIds.length === 0) return;

  const { data: items } = await admin
    .from('onboarding_checklist_items')
    .select('id, data')
    .in('group_id', groupIds)
    .eq('kind', 'schedule_meeting');
  const candidate = (items ?? []).find((it) => {
    const data = (it.data as Record<string, unknown> | null | undefined) ?? {};
    return !data.scheduling_event_id;
  });
  if (!candidate) return;

  const prevData = (candidate.data as Record<string, unknown> | null | undefined) ?? {};
  const nextData = {
    ...prevData,
    scheduling_event_id: eventId,
    share_token: shareToken,
    share_url: shareUrl,
    auto_created_at: new Date().toISOString(),
  };
  await admin
    .from('onboarding_checklist_items')
    .update({ data: nextData })
    .eq('id', candidate.id);

  // Patch the team_scheduling_events row to reference this item so the pick
  // route's existing schedule_meeting flip wiring (lines ~239-264) fires.
  await admin
    .from('team_scheduling_events')
    .update({ item_id: candidate.id })
    .eq('id', eventId);
}
