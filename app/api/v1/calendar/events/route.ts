import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCalendarEventsViaNango, createCalendarEventViaNango, isNangoConfigured } from '@/lib/nango/client';

const createEventSchema = z.object({
  summary: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string(),
  end: z.string(),
  attendees: z.array(z.object({ email: z.string().email() })).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end query params are required' }, { status: 400 });
  }

  if (!isNangoConfigured()) {
    return NextResponse.json({ error: 'Calendar integration not configured' }, { status: 503 });
  }

  const admin = createAdminClient();

  // Get user's Nango connection
  const { data: userData } = await admin
    .from('users')
    .select('nango_connection_id')
    .eq('id', auth.ctx.userId)
    .single();

  if (!userData?.nango_connection_id) {
    return NextResponse.json({ error: 'No calendar connected for this user' }, { status: 404 });
  }

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const daysAhead = Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));

  try {
    const rawEvents = await fetchCalendarEventsViaNango(userData.nango_connection_id, daysAhead);

    const events = rawEvents.map((e) => ({
      id: e.id,
      title: e.summary ?? 'Untitled',
      start: e.start.dateTime ?? e.start.date ?? start,
      end: e.end.dateTime ?? e.end.date ?? end,
      is_all_day: !e.start.dateTime,
    }));

    return NextResponse.json({ events });
  } catch (err) {
    console.error('V1 calendar events error:', err);
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  if (!isNangoConfigured()) {
    return NextResponse.json({ error: 'Calendar integration not configured' }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from('users')
    .select('nango_connection_id')
    .eq('id', auth.ctx.userId)
    .single();

  if (!userData?.nango_connection_id) {
    return NextResponse.json({ error: 'No calendar connected for this user' }, { status: 404 });
  }

  try {
    const event = await createCalendarEventViaNango(userData.nango_connection_id, {
      summary: parsed.data.summary,
      description: parsed.data.description,
      location: parsed.data.location,
      start: { dateTime: parsed.data.start },
      end: { dateTime: parsed.data.end },
      attendees: parsed.data.attendees,
    });

    return NextResponse.json({ event: { id: event.id, summary: parsed.data.summary } }, { status: 201 });
  } catch (err) {
    console.error('V1 calendar create error:', err);
    return NextResponse.json({ error: 'Failed to create calendar event' }, { status: 500 });
  }
}
