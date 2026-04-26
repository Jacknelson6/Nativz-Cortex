import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchBusyForEmail } from '@/lib/scheduling/google-busy';
import { computeFreeSlots, groupSlotsByDay } from '@/lib/scheduling/overlap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/schedule/[token]
 *
 * Public, share-token-gated. Returns event metadata + the current overlap-free
 * slots across the event's required members for the next `lookahead_days`.
 *
 * Each request fetches fresh freebusy from Google for every required member
 * (we don't cache — calendars change minute-to-minute and this is a low-traffic
 * picker UX). Optional members are reported per-slot but don't block.
 *
 * Members without a connected Google account are flagged in `member_errors`
 * so the picker UI can show a banner like "Cole hasn't connected Google —
 * her calendar isn't checked." Slots are still returned (we treat unreachable
 * members as fully available rather than refusing to show anything).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('team_scheduling_events')
    .select(
      'id, name, duration_minutes, lookahead_days, working_start, working_end, timezone, status, client_id',
    )
    .eq('share_token', token)
    .maybeSingle();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (event.status !== 'open') {
    return NextResponse.json({
      ok: true,
      event: { ...event, share_token: token },
      members: [],
      slots: [],
      groups: [],
      already_picked: event.status === 'scheduled',
      member_errors: [],
    });
  }

  // Surface client name (for picker header) when linked.
  let clientName: string | null = null;
  if (event.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('name')
      .eq('id', event.client_id)
      .maybeSingle();
    clientName = (client?.name as string | null) ?? null;
  }

  const { data: memberRows } = await admin
    .from('team_scheduling_event_members')
    .select('id, user_id, email, display_name, role_label, attendance')
    .eq('event_id', event.id);
  const members = memberRows ?? [];

  const requiredMembers = members.filter((m) => m.attendance === 'required');
  const now = new Date();
  const timeMin = now;
  const timeMax = new Date(now.getTime() + event.lookahead_days * 24 * 60 * 60 * 1000);

  // Parallel freebusy fetch via service-account / DWD impersonation.
  const freebusyResults = await Promise.all(
    requiredMembers.map((m) =>
      fetchBusyForEmail({ email: m.email as string, timeMin, timeMax }).then((r) => ({
        member: m,
        ...r,
      })),
    ),
  );

  const memberErrors = freebusyResults
    .filter((r) => !r.ok)
    .map((r) => ({
      email: r.member.email as string,
      display_name: (r.member.display_name as string | null) ?? (r.member.email as string),
      error: r.error ?? 'unknown',
    }));

  // Persist last-fetch state per member so the admin UI can show a freshness
  // hint. Do this best-effort — failures here shouldn't block the picker.
  await Promise.all(
    freebusyResults.map((r) =>
      admin
        .from('team_scheduling_event_members')
        .update({
          last_freebusy_fetched_at: new Date().toISOString(),
          last_freebusy_error: r.ok ? null : r.error ?? 'unknown',
        })
        .eq('id', r.member.id as string),
    ),
  );

  const busyByUser = freebusyResults.map((r) => r.busy);

  const slots = computeFreeSlots({
    busyByUser,
    durationMinutes: event.duration_minutes,
    lookaheadDays: event.lookahead_days,
    workingStart: event.working_start,
    workingEnd: event.working_end,
    timezone: event.timezone,
    now,
  });

  const groups = groupSlotsByDay(slots, event.timezone).map((g) => ({
    day_iso: g.dayIso,
    slots: g.slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
  }));

  return NextResponse.json({
    ok: true,
    event: {
      id: event.id,
      name: event.name,
      duration_minutes: event.duration_minutes,
      lookahead_days: event.lookahead_days,
      working_start: event.working_start,
      working_end: event.working_end,
      timezone: event.timezone,
      status: event.status,
      client_name: clientName,
    },
    members: members.map((m) => ({
      id: m.id,
      display_name: m.display_name ?? m.email,
      role_label: m.role_label,
      attendance: m.attendance,
    })),
    groups,
    member_errors: memberErrors,
  });
}
