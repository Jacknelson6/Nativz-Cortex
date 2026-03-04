import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { syncClientReporting } from '@/lib/reporting/sync';
import type { DateRange } from '@/lib/types/reporting';

const syncSchema = z.object({
  clientId: z.string().uuid(),
  dateRange: z
    .object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = syncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { clientId, dateRange: providedRange } = parsed.data;

    // Default to last 7 days if not provided
    const dateRange: DateRange = providedRange ?? {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      end: new Date().toISOString().split('T')[0],
    };

    const result = await syncClientReporting(clientId, dateRange);

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/reporting/sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
