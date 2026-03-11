import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  updateCalendarEventViaNango,
  deleteCalendarEventViaNango,
  isNangoConfigured,
} from '@/lib/nango/client';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const patchMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  client_id: z.string().uuid().optional(),
  scheduled_at: z.string().optional(),
  duration_minutes: z.number().int().min(15).max(480).optional(),
  location: z.string().nullable().optional(),
  recurrence_rule: z.string().nullable().optional(),
  attendees: z
    .array(z.object({ email: z.string().email(), name: z.string().optional(), role: z.string().optional() }))
    .optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyAdmin(userId: string) {
  const adminClient = createAdminClient();
  const { data } = await adminClient.from('users').select('role').eq('id', userId).single();
  return data?.role === 'admin';
}

async function getNangoConnectionId(userId: string): Promise<string | null> {
  if (!isNangoConfigured()) return null;
  const adminClient = createAdminClient();
  const { data } = await adminClient.from('users').select('nango_connection_id').eq('id', userId).single();
  return data?.nango_connection_id ?? null;
}

// ─── GET /api/meetings/[id] ───────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const adminClient = createAdminClient();
    const { data: meeting, error } = await adminClient
      .from('meetings')
      .select('*, clients(id, name, slug)')
      .eq('id', id)
      .single();

    if (error || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    return NextResponse.json({ meeting });
  } catch (error) {
    console.error('GET /api/meetings/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PATCH /api/meetings/[id] ─────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
    const parsed = patchMeetingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    // Get existing meeting for Google Calendar sync
    const { data: existing } = await adminClient.from('meetings').select('google_event_id, scheduled_at, duration_minutes').eq('id', id).single();

    const { data: meeting, error } = await adminClient
      .from('meetings')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, clients(id, name, slug)')
      .single();

    if (error) {
      console.error('PATCH /api/meetings/[id] error:', error);
      return NextResponse.json({ error: 'Failed to update meeting' }, { status: 500 });
    }

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Sync update to Google Calendar
    if (existing?.google_event_id) {
      const connectionId = await getNangoConnectionId(user.id);
      if (connectionId) {
        try {
          const updateData: Record<string, unknown> = {};
          if (parsed.data.title) updateData.summary = parsed.data.title;
          if (parsed.data.location !== undefined) updateData.location = parsed.data.location;
          if (parsed.data.notes !== undefined) updateData.description = parsed.data.notes;
          if (parsed.data.scheduled_at) {
            const startDate = new Date(parsed.data.scheduled_at);
            const dur = parsed.data.duration_minutes ?? existing.duration_minutes ?? 30;
            const endDate = new Date(startDate.getTime() + dur * 60 * 1000);
            updateData.start = { dateTime: startDate.toISOString() };
            updateData.end = { dateTime: endDate.toISOString() };
          }
          if (parsed.data.attendees) {
            updateData.attendees = parsed.data.attendees.map((a) => ({ email: a.email }));
          }

          if (Object.keys(updateData).length > 0) {
            await updateCalendarEventViaNango(
              connectionId,
              existing.google_event_id,
              updateData as Parameters<typeof updateCalendarEventViaNango>[2],
            );
          }
        } catch (err) {
          console.error('Google Calendar update failed:', err);
        }
      }
    }

    return NextResponse.json({ meeting });
  } catch (error) {
    console.error('PATCH /api/meetings/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE /api/meetings/[id] ────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const adminClient = createAdminClient();

    // Get meeting for Google Calendar cleanup
    const { data: meeting } = await adminClient.from('meetings').select('google_event_id').eq('id', id).single();

    // Soft-delete: mark as cancelled
    const { error } = await adminClient.from('meetings').update({ status: 'cancelled' }).eq('id', id);

    if (error) {
      console.error('DELETE /api/meetings/[id] error:', error);
      return NextResponse.json({ error: 'Failed to cancel meeting' }, { status: 500 });
    }

    // Cancel on Google Calendar
    if (meeting?.google_event_id) {
      const connectionId = await getNangoConnectionId(user.id);
      if (connectionId) {
        try {
          await deleteCalendarEventViaNango(connectionId, meeting.google_event_id);
        } catch (err) {
          console.error('Google Calendar delete failed:', err);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/meetings/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
