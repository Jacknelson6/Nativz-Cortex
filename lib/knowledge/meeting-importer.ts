import { createCompletion } from '@/lib/ai/client';
import { createKnowledgeEntry, getKnowledgeEntries } from './queries';
import { autoLinkEntities } from './entity-linker';
import type { KnowledgeEntry, MeetingNoteMetadata } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeetingImportResult {
  entry: KnowledgeEntry;
  linkedEntries: number;
}

interface MeetingExtraction {
  summary: string;
  attendees: string[];
  keyDecisions: string[];
  actionItems: string[];
  topicsDiscussed: string[];
}

// ---------------------------------------------------------------------------
// AI extraction
// ---------------------------------------------------------------------------

async function extractMeetingData(
  transcript: string,
  existingTitles: string[]
): Promise<MeetingExtraction & { structuredContent: string }> {
  const titlesSnippet =
    existingTitles.length > 0
      ? `\nExisting knowledge-base titles (use [[Title]] wikilinks where relevant):\n${existingTitles.map((t) => `- ${t}`).join('\n')}`
      : '';

  const prompt = `You are analyzing a meeting transcript. Return a JSON object (no markdown fences) with these fields:

1. "summary": a 2-3 sentence summary of the meeting
2. "attendees": array of attendee names mentioned
3. "keyDecisions": array of key decisions made
4. "actionItems": array of action items with owners if mentioned
5. "topicsDiscussed": array of topics/themes discussed
6. "structuredContent": the meeting notes rewritten as clean structured markdown with these sections:
   ## Summary
   ## Attendees
   ## Key decisions
   ## Action items
   ## Discussion notes
   Use [[wikilinks]] to reference any of the existing titles listed below when they are mentioned or relevant.
${titlesSnippet}

Meeting transcript:
${transcript.slice(0, 15_000)}`;

  const response = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2000,
    feature: 'meeting_import',
  });

  const text = response.text.trim();
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned);

  return {
    summary: parsed.summary ?? '',
    attendees: parsed.attendees ?? [],
    keyDecisions: parsed.keyDecisions ?? [],
    actionItems: parsed.actionItems ?? [],
    topicsDiscussed: parsed.topicsDiscussed ?? [],
    structuredContent: parsed.structuredContent ?? '',
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function importMeetingNotes(
  clientId: string,
  transcript: string,
  options?: {
    meetingDate?: string;
    attendees?: string[];
    source?: string;
    createdBy?: string | null;
  }
): Promise<MeetingImportResult> {
  // Fetch existing titles for wikilinks
  const existingEntries = await getKnowledgeEntries(clientId);
  const existingTitles = existingEntries.map((e) => e.title);

  // Extract structured data via AI
  const extracted = await extractMeetingData(transcript, existingTitles);

  // Merge attendees from options with AI-extracted ones
  const allAttendees = [
    ...new Set([
      ...(options?.attendees ?? []),
      ...extracted.attendees,
    ]),
  ];

  // Build metadata
  const metadata: MeetingNoteMetadata = {
    meeting_date: options?.meetingDate ?? new Date().toISOString().split('T')[0],
    attendees: allAttendees,
    action_items: extracted.actionItems,
    source: (options?.source as MeetingNoteMetadata['source']) ?? 'manual',
    meeting_series: 'adhoc',
    association: 'client',
  };

  // Build title from date and first topic
  const dateStr = metadata.meeting_date ?? new Date().toISOString().split('T')[0];
  const topicSnippet = extracted.topicsDiscussed[0]
    ? ` — ${extracted.topicsDiscussed[0]}`
    : '';
  const title = `Meeting notes ${dateStr}${topicSnippet}`;

  // Create entry
  const entry = await createKnowledgeEntry({
    client_id: clientId,
    type: 'meeting_note',
    title,
    content: extracted.structuredContent || extracted.summary,
    metadata: {
      ...metadata,
      entities: {
        people: allAttendees.map((name) => ({ name })),
        products: [],
        locations: [],
        faqs: [],
        testimonials: [],
      },
    } as unknown as Record<string, unknown>,
    source: 'imported',
    created_by: options?.createdBy ?? null,
  });

  // Auto-link entities
  let linkedEntries = 0;
  try {
    await autoLinkEntities(clientId, entry.id);
    // Count links created (approximate — read links after)
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { count } = await admin
      .from('client_knowledge_links')
      .select('*', { count: 'exact', head: true })
      .or(`source_id.eq.${entry.id},target_id.eq.${entry.id}`);
    linkedEntries = count ?? 0;
  } catch (err) {
    console.error('Meeting import: failed to auto-link entities', err);
  }

  return { entry, linkedEntries };
}
