import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCalendarEventsViaNango, isNangoConfigured } from '@/lib/nango/client';

// ─── In-memory cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  data: CalendarResult;
  timestamp: number;
}

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const eventsCache = new Map<string, CacheEntry>();

function getCached(key: string): CalendarResult | null {
  const entry = eventsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    eventsCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: CalendarResult): void {
  eventsCache.set(key, { data, timestamp: Date.now() });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  is_all_day: boolean;
}

interface CalendarResult {
  name: string;
  color: string;
  connection_type: string;
  events: CalendarEvent[];
}

// ─── Zod validation ───────────────────────────────────────────────────────────

const querySchema = z.object({
  connection_ids: z.string().min(1, 'connection_ids is required'),
  start: z.string().datetime({ message: 'start must be a valid ISO date' }),
  end: z.string().datetime({ message: 'end must be a valid ISO date' }),
});

// ─── GET /api/calendar/events ─────────────────────────────────────────────────

/**
 * GET /api/calendar/events
 *
 * Fetches Google Calendar events from multiple connections in parallel.
 *
 * Query params:
 *   connection_ids  — comma-separated calendar_connections.id values
 *   start           — ISO datetime (range start)
 *   end             — ISO datetime (range end)
 *
 * Returns:
 *   { calendars: { [connectionId]: { name, color, connection_type, events[] } } }
 *
 * Client connections (connection_type='client') have event titles replaced
 * with "Busy" to preserve privacy.
 */
export async function GET(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Validate query params ─────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      connection_ids: searchParams.get('connection_ids') ?? '',
      start: searchParams.get('start') ?? '',
      end: searchParams.get('end') ?? '',
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { connection_ids: connectionIdsParam, start, end } = parsed.data;
    const connectionIds = connectionIdsParam.split(',').map((s) => s.trim()).filter(Boolean);

    if (connectionIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one connection_id is required' },
        { status: 400 },
      );
    }

    if (!isNangoConfigured()) {
      return NextResponse.json(
        { error: 'Google Calendar integration is not configured' },
        { status: 503 },
      );
    }

    // ── Fetch calendar_connections rows ───────────────────────────────────────
    const adminClient = createAdminClient();
    const { data: connections, error: connError } = await adminClient
      .from('calendar_connections')
      .select('id, nango_connection_id, connection_type, display_name, display_color')
      .in('id', connectionIds)
      .eq('is_active', true);

    if (connError) {
      console.error('GET /api/calendar/events — DB error:', connError);
      return NextResponse.json({ error: 'Failed to fetch calendar connections' }, { status: 500 });
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({ calendars: {} });
    }

    // Compute how many days ahead the requested range spans (min 1)
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const daysAhead = Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));

    // ── Fetch events in parallel (Promise.allSettled) ──────────────────────────
    const results = await Promise.allSettled(
      connections.map(async (conn) => {
        // Cache key scoped to connection + date range
        const cacheKey = `${conn.id}::${start}::${end}`;
        const cached = getCached(cacheKey);
        if (cached) {
          return { connectionId: conn.id, result: cached };
        }

        if (!conn.nango_connection_id) {
          throw new Error(`No nango_connection_id for connection ${conn.id}`);
        }

        const rawEvents = await fetchCalendarEventsViaNango(
          conn.nango_connection_id,
          daysAhead,
        );

        const isClient = conn.connection_type === 'client';

        const events: CalendarEvent[] = rawEvents.map((e) => {
          const isAllDay = !e.start.dateTime;
          const eventStart = e.start.dateTime ?? e.start.date ?? start;
          const eventEnd = e.end.dateTime ?? e.end.date ?? end;

          return {
            id: e.id,
            title: isClient ? 'Busy' : (e.summary ?? 'Untitled'),
            start: eventStart,
            end: eventEnd,
            is_all_day: isAllDay,
          };
        });

        const calendarResult: CalendarResult = {
          name: conn.display_name ?? 'Calendar',
          color: conn.display_color ?? '#6366f1',
          connection_type: conn.connection_type ?? 'team',
          events,
        };

        setCache(cacheKey, calendarResult);
        return { connectionId: conn.id, result: calendarResult };
      }),
    );

    // ── Assemble response — include partial results, log failures ─────────────
    const calendars: Record<string, CalendarResult> = {};

    for (const outcome of results) {
      if (outcome.status === 'fulfilled') {
        const { connectionId, result } = outcome.value;
        calendars[connectionId] = result;
      } else {
        console.error('GET /api/calendar/events — fetch failed for a connection:', outcome.reason);
      }
    }

    return NextResponse.json({ calendars });
  } catch (error) {
    console.error('GET /api/calendar/events error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
