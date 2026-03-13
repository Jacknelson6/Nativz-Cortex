import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { importMeetingNotes } from '@/lib/knowledge/meeting-importer';

const importMeetingSchema = z.object({
  transcript: z.string().min(1, 'Transcript is required'),
  meetingDate: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  source: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = importMeetingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { id: clientId } = await params;
    const { transcript, meetingDate, attendees, source } = parsed.data;

    const result = await importMeetingNotes(clientId, transcript, {
      meetingDate,
      attendees,
      source,
      createdBy: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Import meeting notes error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import meeting notes' },
      { status: 500 }
    );
  }
}
