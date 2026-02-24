/**
 * POST /api/shoots/schedule
 *
 * Create a scheduled shoot: save to DB, optionally create
 * a Google Calendar event, and update the Monday item status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isNangoConfigured, createCalendarEventViaNango } from '@/lib/nango/client';

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
    if (data.add_to_calendar && isNangoConfigured()) {
      try {
        // Get user's Nango connection
        const { data: connection } = await adminClient
          .from('calendar_connections')
          .select('nango_connection_id')
          .eq('user_id', user.id)
          .single();

        if (connection?.nango_connection_id) {
          const event = await createCalendarEventViaNango(connection.nango_connection_id, {
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
