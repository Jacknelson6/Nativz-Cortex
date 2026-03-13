import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';

const importSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['meeting_note', 'note', 'document']).default('note'),
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  meeting_date: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  source: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  try {
    const { id: clientId } = await params;
    const body = await request.json();
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const { type, content, title, metadata, meeting_date, attendees, source } = parsed.data;

    if (type === 'meeting_note') {
      const { importMeetingNotes } = await import('@/lib/knowledge/meeting-importer');
      const result = await importMeetingNotes(clientId, content, {
        meetingDate: meeting_date,
        attendees,
        source: source ?? 'api',
        createdBy: null,
      });

      return NextResponse.json({
        entry: {
          id: result.entry.id,
          title: result.entry.title,
          type: result.entry.type,
        },
        linked_entries: result.linkedEntries,
      }, { status: 201 });
    }

    // For note/document types, use structurer if available
    const { createKnowledgeEntry } = await import('@/lib/knowledge/queries');
    const entry = await createKnowledgeEntry({
      client_id: clientId,
      type,
      title: title ?? `Imported ${type}`,
      content,
      metadata: metadata ?? {},
      source: 'imported',
      created_by: null,
    });

    return NextResponse.json({ entry: { id: entry.id, title: entry.title, type: entry.type } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/v1/clients/[id]/knowledge/import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
