/**
 * POST /api/shoots/schedule
 *
 * Create a scheduled shoot event: persists to shoot_events, optionally creates a Google
 * Calendar event via Google OAuth (with invites to team, client, and videographer emails),
 * and sends an in-app notification to the requesting admin.
 *
 * @auth Required (admin)
 * @body client_name - Client name for the shoot title (required)
 * @body client_id - Client UUID or null (required)
 * @body monday_item_id - Monday.com item ID to associate (optional)
 * @body shoot_date - Shoot date in ISO format YYYY-MM-DD (required)
 * @body shoot_time - Start time HH:MM (defaults to 09:00 if omitted)
 * @body location - Shoot location (optional)
 * @body notes - Shoot notes (optional)
 * @body agency - 'Nativz' | 'Anderson Collaborative' (required)
 * @body team_emails - Team member emails to invite (required)
 * @body client_emails - Client contact emails to invite (required)
 * @body additional_emails - Additional attendee emails (required)
 * @body videographer_emails - Videographer emails to invite (required)
 * @body add_to_calendar - Create Google Calendar event (default true)
 * @body send_invites - Send calendar invites to attendees (default true)
 * @returns {{ success: true, shootId: string, googleEventCreated: boolean, invitesSent: boolean, inviteeCount: number }}
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getValidToken } from '@/lib/google/auth';
import { createNotification } from '@/lib/notifications/create';

// ─── Google Calendar create helper ────────────────────────────────────────────

interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
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

const scheduleSchema = z.object({
  client_name: z.string().min(1),
  client_id: z.string().uuid().nullable(),
  monday_item_id: z.string().optional(),
  shoot_date: z.string(), // ISO date
  shoot_time: z.string().optional(), // HH:MM
  location: z.string().optional(),
  notes: z.string().optional(),
  agency: z.enum(['Nativz', 'Anderson Collaborative']),
  team_emails: z.array(z.string().email()),
  client_emails: z.array(z.string().email()),
  additional_emails: z.array(z.string().email()),
  videographer_emails: z.array(z.string().email()),
  add_to_calendar: z.boolean().default(true),
  send_invites: z.boolean().default(true),
});

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
    const parsed = scheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Build all invitees list
    const allInvitees = [
      ...new Set([
        ...data.team_emails,
        ...data.client_emails,
        ...data.additional_emails,
        ...data.videographer_emails,
      ]),
    ];

    // Build shoot date/time
    const shootDateTime = data.shoot_time
      ? `${data.shoot_date}T${data.shoot_time}:00`
      : `${data.shoot_date}T09:00:00`;
    const endDateTime = data.shoot_time
      ? `${data.shoot_date}T${String(Number(data.shoot_time.split(':')[0]) + 4).padStart(2, '0')}:${data.shoot_time.split(':')[1]}:00`
      : `${data.shoot_date}T17:00:00`;

    let googleEventId: string | null = null;

    // Create Google Calendar event if requested
    if (data.add_to_calendar) {
      try {
        const accessToken = await getValidToken(user.id);
        if (accessToken) {
          const event = await createCalendarEvent(accessToken, {
            summary: `${data.client_name} Content Shoot`,
            description: data.notes || '',
            location: data.location || '',
            start: { dateTime: shootDateTime, timeZone: 'America/New_York' },
            end: { dateTime: endDateTime, timeZone: 'America/New_York' },
            attendees: data.send_invites
              ? allInvitees.map((email) => ({ email }))
              : undefined,
          });
          googleEventId = event.id;
        }
      } catch (e) {
        console.warn('Google Calendar event creation failed (non-blocking):', e);
      }
    }

    // Save shoot event to DB
    const { data: shootEvent, error: insertError } = await adminClient
      .from('shoot_events')
      .insert({
        title: `${data.client_name} Content Shoot`,
        client_id: data.client_id,
        shoot_date: shootDateTime,
        location: data.location || null,
        notes: data.notes || null,
        monday_item_id: data.monday_item_id || null,
        google_event_id: googleEventId,
        google_calendar_event_created: !!googleEventId,
        scheduled_status: 'scheduled',
        invitees: allInvitees,
        plan_status: 'pending',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to create shoot event:', insertError);
      return NextResponse.json({ error: 'Failed to save shoot' }, { status: 500 });
    }

    // Notify admin about scheduled shoot
    createNotification({
      recipientUserId: user.id,
      type: 'shoot_scheduled',
      title: 'Shoot scheduled',
      body: `${data.client_name} shoot on ${data.shoot_date}`,
      linkPath: `/admin/shoots/${shootEvent.id}`,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      shootId: shootEvent.id,
      googleEventCreated: !!googleEventId,
      invitesSent: data.send_invites && !!googleEventId,
      inviteeCount: allInvitees.length,
    });
  } catch (error) {
    console.error('POST /api/shoots/schedule error:', error);
    return NextResponse.json({ error: 'Failed to schedule shoot' }, { status: 500 });
  }
}
