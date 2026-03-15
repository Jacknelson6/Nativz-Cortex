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

/**
 * POST /api/clients/[id]/knowledge/import-meeting
 *
 * Import a meeting transcript as a structured knowledge entry for a client. Uses AI to
 * extract key information, action items, and entities from the transcript, then creates
 * a meeting_note entry with auto-generated embedding.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID
 * @body transcript - Raw meeting transcript text (required)
 * @body meetingDate - Optional ISO date string for the meeting
 * @body attendees - Optional array of attendee names
 * @body source - Optional source label (e.g. 'zoom', 'google_meet')
 * @returns {KnowledgeEntry} The created knowledge entry
 */
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
