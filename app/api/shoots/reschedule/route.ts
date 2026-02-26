/**
 * POST /api/shoots/reschedule
 *
 * Updates the shoot date on the Monday.com Content Calendars board.
 * Used by the calendar drag-to-reschedule feature.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { mondayQuery, isMondayConfigured } from '@/lib/monday/client';

const CONTENT_CALENDARS_BOARD_ID = process.env.MONDAY_CONTENT_CALENDARS_BOARD_ID || '';

const rescheduleSchema = z.object({
  monday_item_id: z.string().regex(/^\d+$/, 'Must be a numeric Monday item ID'),
  new_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
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

    if (!isMondayConfigured() || !CONTENT_CALENDARS_BOARD_ID) {
      return NextResponse.json({ error: 'Monday.com not configured' }, { status: 503 });
    }

    const body = await request.json();
    const parsed = rescheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { monday_item_id, new_date } = parsed.data;

    // Update the shoot date column on Monday.com
    const columnValues = JSON.stringify(JSON.stringify({
      date_mkrv3eyh: { date: new_date },
    }));

    await mondayQuery(`
      mutation {
        change_multiple_column_values(
          board_id: ${CONTENT_CALENDARS_BOARD_ID},
          item_id: ${monday_item_id},
          column_values: ${columnValues}
        ) {
          id
        }
      }
    `);

    // Also update the shoot_events table if there's a matching record
    await adminClient
      .from('shoot_events')
      .update({ shoot_date: new_date })
      .eq('monday_item_id', monday_item_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/shoots/reschedule error:', error);
    return NextResponse.json({ error: 'Failed to reschedule shoot' }, { status: 500 });
  }
}
