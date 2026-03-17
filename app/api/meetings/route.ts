import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getValidToken } from '@/lib/google/auth';

// ─── Google Calendar create helper ────────────────────────────────────────────

interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  attendees?: { email: string }[];
  recurrence?: string[];
}

async function createCalendarEvent(
  accessToken: string,
  eventData: CalendarEventInput,
): Promise<{ id: string }> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar create failed: ${err}`);
  }

  return res.json();
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const createMeetingSchema = z.object({
  client_id: z.string().uuid().nullable(),
  title: z.string().min(1, 'Title is required'),
  scheduled_at: z.string().min(1, 'Scheduled date/time is required'),
  duration_minutes: z.number().int().min(15).max(480).default(30),
  location: z.string().nullable().optional(),
  recurrence_rule: z.string().nullable().optional(),
  attendees: z
    .array(z.object({ email: z.string().email(), name: z.string().optional(), role: z.string().optional() }))
    .default([]),
  notes: z.string().nullable().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyAdmin(userId: string) {
  const adminClient = createAdminClient();
  const { data } = await adminClient.from('users').select('role').eq('id', userId).single();
  return data?.role === 'admin';
}

/**
 * GET /api/meetings
 *
 * List meetings for the admin dashboard. Supports filtering by client, status, and date range.
 * When a full date range is specified, also returns recurring meetings whose series started
 * before the range (so their occurrences within the range are visible).
 *
 * @auth Required (admin)
 * @query client_id - Filter by client UUID
 * @query date_from - Start of date range (ISO datetime or YYYY-MM-DD)
 * @query date_to - End of date range (ISO datetime or YYYY-MM-DD; end of day is included)
 * @query status - Filter by meeting status
 * @returns {{ meetings: Meeting[] }} Array of meeting records with client relation
 */
// ─── GET /api/meetings ────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const status = searchParams.get('status');

    const adminClient = createAdminClient();

    let query = adminClient
      .from('meetings')
      .select('*, clients(id, name, slug)')
      .order('scheduled_at', { ascending: true });

    if (clientId) query = query.eq('client_id', clientId);
    if (status) query = query.eq('status', status);

    if (dateFrom && dateTo) {
      const dateToFull = dateTo.includes('T') ? dateTo : `${dateTo}T23:59:59`;
      query = query.or(
        `and(scheduled_at.gte.${dateFrom},scheduled_at.lte.${dateToFull}),and(recurrence_rule.not.is.null,scheduled_at.lte.${dateToFull})`,
      );
    } else {
      if (dateFrom) query = query.gte('scheduled_at', dateFrom);
      if (dateTo) {
        const dateToFull = dateTo.includes('T') ? dateTo : `${dateTo}T23:59:59`;
        query = query.lte('scheduled_at', dateToFull);
      }
    }

    const { data: meetings, error } = await query;

    if (error) {
      console.error('GET /api/meetings error:', error);
      return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 });
    }

    return NextResponse.json({ meetings: meetings ?? [] });
  } catch (error) {
    console.error('GET /api/meetings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/meetings
 *
 * Create a new meeting. If no attendees are provided and a client_id is given,
 * auto-populates attendees from client contacts and assigned team members.
 * Creates a Google Calendar event via Google OAuth if the user has a token (non-fatal).
 *
 * @auth Required (admin)
 * @body client_id - Associated client UUID (nullable)
 * @body title - Meeting title (required)
 * @body scheduled_at - ISO datetime string of the meeting start (required)
 * @body duration_minutes - Duration in minutes (15-480, default: 30)
 * @body location - Meeting location or video link (nullable)
 * @body recurrence_rule - iCal RRULE string for recurring meetings (nullable)
 * @body attendees - Array of { email, name?, role? } objects (auto-populated if empty + client_id given)
 * @body notes - Meeting notes (nullable)
 * @returns {{ meeting: Meeting & { google_event_id: string | null } }}
 */
// ─── POST /api/meetings ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createMeetingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { client_id, title, scheduled_at, duration_minutes, location, recurrence_rule, notes } =
      parsed.data;
    let { attendees } = parsed.data;

    const adminClient = createAdminClient();

    // Auto-populate attendees from client contacts + assigned team members if none provided
    if (attendees.length === 0 && client_id) {
      const [contactsResult, assignmentsResult] = await Promise.all([
        adminClient.from('contacts').select('name, email, role').eq('client_id', client_id),
        adminClient
          .from('client_assignments')
          .select('role, team_members(full_name, email)')
          .eq('client_id', client_id),
      ]);

      const emailSet = new Set<string>();
      const autoAttendees: typeof attendees = [];

      for (const c of contactsResult.data ?? []) {
        if (c.email && !emailSet.has(c.email)) {
          emailSet.add(c.email);
          autoAttendees.push({ email: c.email, name: c.name ?? undefined, role: c.role ?? 'client' });
        }
      }

      for (const a of assignmentsResult.data ?? []) {
        const tm = a.team_members as unknown as { full_name: string; email: string } | null;
        if (tm?.email && !emailSet.has(tm.email)) {
          emailSet.add(tm.email);
          autoAttendees.push({ email: tm.email, name: tm.full_name ?? undefined, role: a.role ?? 'team' });
        }
      }

      attendees = autoAttendees;
    }

    // Insert meeting
    const { data: meeting, error: insertError } = await adminClient
      .from('meetings')
      .insert({
        client_id,
        title,
        scheduled_at,
        duration_minutes,
        location: location || null,
        recurrence_rule: recurrence_rule || null,
        attendees,
        notes: notes || null,
        created_by: user.id,
      })
      .select('*, clients(id, name, slug)')
      .single();

    if (insertError || !meeting) {
      console.error('POST /api/meetings insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create meeting' }, { status: 500 });
    }

    // Push to Google Calendar if user has a Google OAuth token
    let googleEventId: string | null = null;

    const accessToken = await getValidToken(user.id);
    if (accessToken) {
      try {
        const startDate = new Date(scheduled_at);
        const endDate = new Date(startDate.getTime() + duration_minutes * 60 * 1000);

        const calEventData: CalendarEventInput = {
          summary: title,
          description: notes || undefined,
          location: location || undefined,
          start: { dateTime: startDate.toISOString() },
          end: { dateTime: endDate.toISOString() },
          attendees: attendees.length > 0 ? attendees.map((a) => ({ email: a.email })) : undefined,
        };

        // Add recurrence if set
        if (recurrence_rule) {
          calEventData.recurrence = [recurrence_rule];
        }

        const calEvent = await createCalendarEvent(accessToken, calEventData);
        googleEventId = calEvent.id;

        // Store google_event_id on the meeting
        await adminClient.from('meetings').update({ google_event_id: calEvent.id }).eq('id', meeting.id);
      } catch (err) {
        console.error('Google Calendar push failed for meeting:', err);
        // Non-fatal — meeting is still created in Cortex
      }
    }

    return NextResponse.json({
      meeting: { ...meeting, google_event_id: googleEventId },
    });
  } catch (error) {
    console.error('POST /api/meetings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
