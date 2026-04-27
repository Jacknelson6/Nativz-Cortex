import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchEventsForPersonCached, emailsCacheKey } from '@/lib/scheduling/calendar-cache';

export const runtime = 'nodejs';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  is_all_day: boolean;
}

interface PersonCalendarResult {
  name: string;
  color: string;
  connection_type: 'team';
  events: CalendarEvent[];
  errors?: { email: string; error: string }[];
}

const querySchema = z.object({
  person_ids: z.string().min(1, 'person_ids is required'),
  start: z.string().datetime({ message: 'start must be a valid ISO date' }),
  end: z.string().datetime({ message: 'end must be a valid ISO date' }),
});

/**
 * GET /api/calendar/events?person_ids=p1,p2&start=ISO&end=ISO
 *
 * Returns Google Calendar events for each scheduling_people row in the given
 * window. Events are fetched via service-account / domain-wide delegation;
 * each person's multiple workspace emails are unioned and deduped before
 * being returned.
 *
 * Response:
 *   { calendars: { [personId]: { name, color, connection_type: 'team', events[], errors? } } }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: me } = await adminClient
      .from('users')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .maybeSingle();
    const isAdmin = me?.role === 'admin' || me?.is_super_admin === true;
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      person_ids: searchParams.get('person_ids') ?? '',
      start: searchParams.get('start') ?? '',
      end: searchParams.get('end') ?? '',
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { person_ids: personIdsParam, start, end } = parsed.data;
    const personIds = [...new Set(personIdsParam.split(',').map((s) => s.trim()).filter(Boolean))];

    if (personIds.length === 0) {
      return NextResponse.json({ error: 'At least one person_id is required' }, { status: 400 });
    }

    const [{ data: peopleRows, error: peopleErr }, { data: emailRows, error: emailErr }] = await Promise.all([
      adminClient
        .from('scheduling_people')
        .select('id, display_name, color, is_active')
        .in('id', personIds),
      adminClient
        .from('scheduling_person_emails')
        .select('person_id, email')
        .in('person_id', personIds),
    ]);

    if (peopleErr || emailErr) {
      console.error('GET /api/calendar/events — DB error:', peopleErr ?? emailErr);
      return NextResponse.json({ error: 'Failed to load people' }, { status: 500 });
    }

    const emailsByPerson = new Map<string, string[]>();
    for (const row of emailRows ?? []) {
      const list = emailsByPerson.get(row.person_id as string) ?? [];
      list.push(row.email as string);
      emailsByPerson.set(row.person_id as string, list);
    }

    const results = await Promise.allSettled(
      (peopleRows ?? [])
        .filter((p) => p.is_active)
        .map(async (p) => {
          const personId = p.id as string;
          const emails = emailsByPerson.get(personId) ?? [];

          const fetched = await fetchEventsForPersonCached(
            personId,
            emailsCacheKey(emails),
            start,
            end,
          );

          const calendarResult: PersonCalendarResult = {
            name: p.display_name as string,
            color: p.color as string,
            connection_type: 'team',
            events: fetched.events.map((e) => ({
              id: e.id,
              title: e.title,
              start: e.start,
              end: e.end,
              is_all_day: e.isAllDay,
            })),
            errors: fetched.errors.length ? fetched.errors : undefined,
          };

          return { personId, result: calendarResult };
        }),
    );

    const calendars: Record<string, PersonCalendarResult> = {};
    for (const outcome of results) {
      if (outcome.status === 'fulfilled') {
        calendars[outcome.value.personId] = outcome.value.result;
      } else {
        console.error('GET /api/calendar/events — fetch failed for a person:', outcome.reason);
      }
    }

    return NextResponse.json({ calendars });
  } catch (error) {
    console.error('GET /api/calendar/events error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
