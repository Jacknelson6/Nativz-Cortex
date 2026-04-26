import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchBusyForEmail } from '@/lib/scheduling/google-busy';
import { checkAndFlipFlowCompletion } from '@/lib/onboarding/check-completion';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/schedule/[token]/pick
 *
 * Public, share-token-gated. The client picks one slot — we revalidate that
 * the slot is still overlap-free for required members (someone may have
 * grabbed an overlapping calendar event in the seconds since the picker
 * loaded), then:
 *
 *   1. Insert team_scheduling_event_picks (UNIQUE index ensures one active
 *      pick per event — concurrent racers get a 409).
 *   2. Flip team_scheduling_events.status = 'scheduled'.
 *   3. If event.item_id is set, patch the linked schedule_meeting onboarding
 *      item: data.scheduled_for, data.scheduling_event_id, status='done'.
 *   4. Trigger flow completion check.
 *   5. Log a lifecycle event so it shows up in the client's activity feed.
 *
 * NOTE: Creating Google Calendar events on team members' calendars is a
 * later iteration — the calendar.readonly scope this scheduler ships with
 * doesn't include event-creation. For now, the team_scheduling_event_picks
 * row is the source of truth and admins manually create the calendar event
 * (or copy the picked time into wherever they need it).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

const Body = z.object({
  start_at: z.string().regex(ISO_RE),
  picked_by_email: z.string().email().max(200),
  picked_by_name: z.string().max(160).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await ctx.params;
    if (!UUID_RE.test(token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 },
      );
    }
    const { start_at, picked_by_email, picked_by_name, notes } = parsed.data;

    const admin = createAdminClient();
    const { data: event } = await admin
      .from('team_scheduling_events')
      .select('id, duration_minutes, status, client_id, flow_id, item_id, name, lookahead_days')
      .eq('share_token', token)
      .maybeSingle();
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (event.status !== 'open') {
      return NextResponse.json(
        { error: 'This time has already been booked or the event was canceled.' },
        { status: 409 },
      );
    }

    const startMs = Date.parse(start_at);
    if (Number.isNaN(startMs)) {
      return NextResponse.json({ error: 'Invalid start_at' }, { status: 400 });
    }
    const endMs = startMs + event.duration_minutes * 60_000;

    // Sanity: the slot must be in the future and inside the event's lookahead window.
    if (startMs <= Date.now()) {
      return NextResponse.json({ error: 'Slot must be in the future' }, { status: 400 });
    }
    const lookaheadMaxMs = Date.now() + (event.lookahead_days + 1) * 24 * 60 * 60 * 1000;
    if (startMs > lookaheadMaxMs) {
      return NextResponse.json({ error: 'Slot outside scheduling window' }, { status: 400 });
    }

    // Revalidate against required members' busy windows so we don't double-book.
    const { data: memberRows } = await admin
      .from('team_scheduling_event_members')
      .select('user_id, attendance, email, display_name')
      .eq('event_id', event.id)
      .eq('attendance', 'required');
    const requiredMembers = memberRows ?? [];

    const conflict = await Promise.all(
      requiredMembers.map(async (m) => {
        const r = await fetchBusyForEmail({
          email: m.email as string,
          timeMin: new Date(startMs - 60_000),
          timeMax: new Date(endMs + 60_000),
        });
        // If we can't reach Google, allow the pick (don't block the client on
        // our own infra failure). The admin UI shows the freshness state per
        // member, so the team can intervene if needed.
        if (!r.ok) return null;
        const overlap = r.busy.some(
          (b) => b.start.getTime() < endMs && b.end.getTime() > startMs,
        );
        return overlap ? (m.display_name ?? m.email) : null;
      }),
    );
    const conflictNames = conflict.filter((x): x is string => !!x);
    if (conflictNames.length > 0) {
      return NextResponse.json(
        {
          error: `That time is no longer free for ${conflictNames.join(', ')}. Please pick another slot.`,
        },
        { status: 409 },
      );
    }

    // Capture picker IP for spam triage. NextRequest exposes headers; trust
    // the platform-provided x-forwarded-for over a request-supplied value.
    const xff = req.headers.get('x-forwarded-for');
    const pickedIp = xff ? xff.split(',')[0].trim() : req.headers.get('x-real-ip');

    const { data: pickRow, error: pickErr } = await admin
      .from('team_scheduling_event_picks')
      .insert({
        event_id: event.id,
        start_at: new Date(startMs).toISOString(),
        end_at: new Date(endMs).toISOString(),
        picked_by_email,
        picked_by_name: picked_by_name ?? null,
        picked_by_ip: pickedIp,
        notes: notes ?? null,
      })
      .select('id, start_at, end_at')
      .single();

    if (pickErr || !pickRow) {
      // Unique partial index → 23505 when there's already an active pick.
      if (pickErr?.code === '23505') {
        return NextResponse.json(
          { error: 'Someone else just booked this event. Please refresh.' },
          { status: 409 },
        );
      }
      console.error('[scheduling:pick] insert failed', pickErr);
      return NextResponse.json({ error: 'Failed to record pick' }, { status: 500 });
    }

    await admin
      .from('team_scheduling_events')
      .update({ status: 'scheduled' })
      .eq('id', event.id);

    // Flip the linked schedule_meeting onboarding item if there is one.
    if (event.item_id) {
      const { data: existingItem } = await admin
        .from('onboarding_checklist_items')
        .select('data')
        .eq('id', event.item_id)
        .maybeSingle();
      const prevData =
        (existingItem?.data as Record<string, unknown> | null | undefined) ?? {};
      const nextData = {
        ...prevData,
        scheduled_for: new Date(startMs).toISOString(),
        scheduling_event_id: event.id,
        scheduling_pick_id: pickRow.id,
        attendees: requiredMembers.map((m) => ({
          email: m.email,
          name: m.display_name,
        })),
      };
      await admin
        .from('onboarding_checklist_items')
        .update({ status: 'done', data: nextData })
        .eq('id', event.item_id);
    }

    if (event.flow_id) {
      await checkAndFlipFlowCompletion(admin, event.flow_id as string);
    }

    if (event.client_id) {
      const startLocal = new Date(startMs).toISOString();
      await logLifecycleEvent(
        event.client_id as string,
        'kickoff.scheduled',
        `${event.name} scheduled for ${startLocal}`,
        {
          metadata: {
            scheduling_event_id: event.id,
            pick_id: pickRow.id,
            start_at: startLocal,
            picked_by_email,
            picked_by_name,
          },
          admin,
        },
      ).catch((err) => console.error('[scheduling:pick] lifecycle log failed', err));
    }

    return NextResponse.json({
      ok: true,
      pick: pickRow,
      event_name: event.name,
    });
  } catch (err) {
    console.error('[scheduling:pick] uncaught', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
