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

/**
 * GET /api/shoots
 *
 * List shoot events, ordered by shoot date ascending. Supports filtering by client, status,
 * and date range. Each result includes the associated client record.
 *
 * @auth Required (admin)
 * @query client_id - Filter by client UUID
 * @query status - Filter by scheduled_status value
 * @query date_from - Only return shoots on or after this date (YYYY-MM-DD)
 * @query date_to - Only return shoots on or before this date (YYYY-MM-DD)
 * @returns {ShootEvent[]} Array of shoot events with client relation
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = adminClient
      .from('shoot_events')
      .select('*, clients(id, name, slug)')
      .order('shoot_date', { ascending: true });

    if (clientId) query = query.eq('client_id', clientId);
    if (status) query = query.eq('scheduled_status', status);
    if (dateFrom) query = query.gte('shoot_date', dateFrom);
    if (dateTo) query = query.lte('shoot_date', dateTo);

    const { data: shoots, error } = await query;

    if (error) {
      console.error('GET /api/shoots error:', error);
      return NextResponse.json({ error: 'Failed to fetch shoots' }, { status: 500 });
    }

    return NextResponse.json(shoots);
  } catch (error) {
    console.error('GET /api/shoots error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const createShootSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  shoot_date: z.string().min(1, 'Date is required'),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  client_ids: z.array(z.string().uuid()).min(1, 'At least one client is required'),
});

/**
 * POST /api/shoots
 *
 * Create shoot events for one or more clients on the same date. Creates one shoot_events
 * row per client. If Google Calendar is connected via OAuth, automatically creates
 * Google Calendar events with client contacts and team member attendees.
 *
 * @auth Required (admin)
 * @body title - Shoot title (required)
 * @body shoot_date - Shoot date/datetime string (required)
 * @body location - Shoot location
 * @body notes - Shoot notes
 * @body client_ids - Array of client UUIDs (at least one required)
 * @returns {{ success: true, count: number, calendar: { shootId: string, eventId?: string, error?: string }[] }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createShootSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { title, shoot_date, location, notes, client_ids } = parsed.data;

    const rows = client_ids.map((client_id) => ({
      title,
      shoot_date,
      location: location || null,
      notes: notes || null,
      client_id,
      plan_status: 'pending' as const,
      created_by: user.id,
    }));

    const { error: insertError, data: inserted } = await adminClient
      .from('shoot_events')
      .insert(rows)
      .select('id, client_id, title, shoot_date, location, notes');

    if (insertError) {
      console.error('POST /api/shoots insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create shoot events' }, { status: 500 });
    }

    // --- Send Google Calendar invites via Google OAuth ---
    let calendarResults: { shootId: string; eventId?: string; error?: string }[] = [];

    const accessToken = await getValidToken(user.id);
    if (accessToken && inserted && inserted.length > 0) {
      calendarResults = await Promise.all(
        inserted.map(async (shoot) => {
          try {
            // Fetch primary contacts for this client
            const { data: contacts } = await adminClient
              .from('contacts')
              .select('email')
              .eq('client_id', shoot.client_id)
              .eq('is_primary', true);

            // Fetch assigned team members for this client
            const { data: assignments } = await adminClient
              .from('client_assignments')
              .select('team_member_id, team_members(email)')
              .eq('client_id', shoot.client_id);

            // Build attendees list (deduplicated)
            const emailSet = new Set<string>();
            for (const c of contacts ?? []) {
              if (c.email) emailSet.add(c.email);
            }
            for (const a of assignments ?? []) {
              const tm = a.team_members as unknown as { email: string } | null;
              if (tm?.email) emailSet.add(tm.email);
            }

            const attendees = [...emailSet].map((email) => ({ email }));

            // Build start/end times — use shoot_date as all-day or with time
            const shootDate = new Date(shoot.shoot_date);
            const startDateTime = shootDate.toISOString();
            const endDate = new Date(shootDate.getTime() + 2 * 60 * 60 * 1000); // 2hr default
            const endDateTime = endDate.toISOString();

            const calEvent = await createCalendarEvent(accessToken, {
              summary: shoot.title,
              description: shoot.notes || undefined,
              location: shoot.location || undefined,
              start: { dateTime: startDateTime },
              end: { dateTime: endDateTime },
              attendees: attendees.length > 0 ? attendees : undefined,
            });

            // Update shoot with Google Calendar event ID
            await adminClient
              .from('shoot_events')
              .update({
                google_event_id: calEvent.id,
                google_calendar_event_created: true,
                invitees: attendees,
              })
              .eq('id', shoot.id);

            return { shootId: shoot.id, eventId: calEvent.id };
          } catch (err) {
            console.error(`Calendar invite failed for shoot ${shoot.id}:`, err);
            return { shootId: shoot.id, error: String(err) };
          }
        }),
      );
    }

    return NextResponse.json({
      success: true,
      count: inserted?.length ?? 0,
      calendar: calendarResults,
    });
  } catch (error) {
    console.error('POST /api/shoots error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
