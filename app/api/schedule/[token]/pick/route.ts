import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchBusyForEmail } from '@/lib/scheduling/google-busy';
import { createSchedulingCalendarEvent } from '@/lib/scheduling/google-event-create';
import { isImpersonateAllowed } from '@/lib/google/service-account';
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
 *   3. Best-effort: create a Google Calendar event on the organizer's
 *      calendar (first required workspace member) with Meet conference and
 *      `sendUpdates=all` so every member + the picker gets a real invite.
 *      Failures (e.g. scope not allowlisted) don't block the pick — the
 *      slot is already locked in our DB and we surface the error so the
 *      team can fall back to a manual invite.
 *   4. If event.item_id is set, patch the linked schedule_meeting onboarding
 *      item: data.scheduled_for, data.scheduling_event_id, status='done'.
 *   5. Trigger flow completion check.
 *   6. Log a lifecycle event so it shows up in the client's activity feed.
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
      .select('id, duration_minutes, status, client_id, flow_id, item_id, name, lookahead_days, timezone')
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

    // Fetch every member once — required ones gate the conflict check; the
    // full set goes on the calendar invite (optional ones flagged so Google
    // shows them as not-required to the picker).
    const { data: memberRows } = await admin
      .from('team_scheduling_event_members')
      .select('user_id, attendance, email, display_name')
      .eq('event_id', event.id);
    const allMembers = memberRows ?? [];
    const requiredMembers = allMembers.filter((m) => m.attendance === 'required');

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

    // Best-effort: create a real Google Calendar event with a Meet link on
    // the organizer's calendar. Google sends the invites + RSVPs to every
    // attendee thanks to `sendUpdates=all`. If the SA scope isn't
    // allowlisted (or anything else fails), we surface the error in the
    // response and fall back to "the team will follow up manually" — the
    // pick is already locked above so the picker still sees a confirmation.
    const organizer = requiredMembers.find((m) =>
      isImpersonateAllowed((m.email ?? '') as string),
    );
    const description = [notes?.trim(), `Booked by ${picked_by_name ?? picked_by_email}`]
      .filter(Boolean)
      .join('\n\n');
    let meetLink: string | null = null;
    let calendarEventId: string | null = null;
    let calendarEventError: string | null = null;
    if (!organizer) {
      calendarEventError =
        'No team member in an authorized workspace — calendar invite must be created manually.';
    } else {
      const result = await createSchedulingCalendarEvent({
        organizerEmail: organizer.email as string,
        summary: event.name,
        description: description.length > 0 ? description : undefined,
        startAt: new Date(startMs),
        endAt: new Date(endMs),
        timezone: event.timezone as string,
        attendees: [
          ...allMembers
            .filter((m) => m.email && m.email !== organizer.email)
            .map((m) => ({
              email: m.email as string,
              displayName: m.display_name,
              optional: m.attendance === 'optional',
            })),
          { email: picked_by_email, displayName: picked_by_name ?? null },
        ],
      }).catch((err) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : 'Calendar create threw',
      }));
      if (result.ok) {
        meetLink = result.meetLink ?? null;
        calendarEventId = result.eventId ?? null;
        await admin
          .from('team_scheduling_event_picks')
          .update({
            google_event_ids: {
              organizer_email: organizer.email,
              event_id: result.eventId ?? null,
              meet_link: meetLink,
              html_link: result.htmlLink ?? null,
            },
          })
          .eq('id', pickRow.id);
      } else {
        calendarEventError = result.error ?? 'Unknown calendar error';
        console.error('[scheduling:pick] calendar event create failed', result.error);
        await admin
          .from('team_scheduling_event_picks')
          .update({
            google_event_ids: {
              organizer_email: organizer.email,
              error: calendarEventError,
            },
          })
          .eq('id', pickRow.id);
      }
    }

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
        meet_link: meetLink,
        calendar_event_id: calendarEventId,
        attendees: allMembers.map((m) => ({
          email: m.email,
          name: m.display_name,
          attendance: m.attendance,
        })),
      };
      await admin
        .from('onboarding_checklist_items')
        .update({ status: 'done', data: nextData })
        .eq('id', event.item_id);
    }

    if (event.flow_id) {
      // Best-effort — the pick is already locked in DB, don't make the picker
      // retry (and hit the unique index 409) just because completion-flip
      // hiccuped downstream.
      await checkAndFlipFlowCompletion(admin, event.flow_id as string).catch((err) =>
        console.error('[scheduling:pick] flow completion check failed', err),
      );
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
            meet_link: meetLink,
            calendar_event_id: calendarEventId,
          },
          admin,
        },
      ).catch((err) => console.error('[scheduling:pick] lifecycle log failed', err));
    }

    return NextResponse.json({
      ok: true,
      pick: pickRow,
      event_name: event.name,
      meet_link: meetLink,
      calendar_event_error: calendarEventError,
    });
  } catch (err) {
    console.error('[scheduling:pick] uncaught', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
