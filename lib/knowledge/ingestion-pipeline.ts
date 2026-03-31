/**
 * Unified graph writes after meeting ingestion — decisions + action items as
 * first-class entries with `produced` links from the meeting node.
 */

import { createKnowledgeEntry, createKnowledgeLink } from './queries';

export interface DecomposedMeetingPayload {
  decisions: Array<{ title: string; body: string }>;
  actionItems: Array<{ title: string; body: string; owner?: string }>;
}

/**
 * Persist extracted decisions and action items, linking each to the meeting entry.
 */
export async function persistMeetingDecomposition(
  clientId: string,
  meetingEntryId: string,
  payload: DecomposedMeetingPayload,
  createdBy: string | null,
): Promise<{ decisionIds: string[]; actionIds: string[] }> {
  const decisionIds: string[] = [];
  const actionIds: string[] = [];

  for (const d of payload.decisions) {
    const body = (d.body ?? '').trim();
    if (!body) continue;
    const title = (d.title ?? '').trim() || body.slice(0, 80);
    const row = await createKnowledgeEntry(
      {
        client_id: clientId,
        type: 'decision',
        title,
        content: body,
        metadata: { source_meeting_id: meetingEntryId },
        source: 'imported',
        created_by: createdBy,
      },
      { skipTemporalEnrichment: true },
    );
    decisionIds.push(row.id);
    await createKnowledgeLink({
      client_id: clientId,
      source_id: meetingEntryId,
      source_type: 'entry',
      target_id: row.id,
      target_type: 'entry',
      label: 'produced',
    });
  }

  for (const a of payload.actionItems) {
    const body = (a.body ?? '').trim();
    if (!body) continue;
    const title = (a.title ?? '').trim() || body.slice(0, 80);
    const row = await createKnowledgeEntry(
      {
        client_id: clientId,
        type: 'action_item',
        title,
        content: a.owner ? `Owner: ${a.owner}\n\n${body}` : body,
        metadata: {
          source_meeting_id: meetingEntryId,
          ...(a.owner ? { owner: a.owner } : {}),
        },
        source: 'imported',
        created_by: createdBy,
      },
      { skipTemporalEnrichment: true },
    );
    actionIds.push(row.id);
    await createKnowledgeLink({
      client_id: clientId,
      source_id: meetingEntryId,
      source_type: 'entry',
      target_id: row.id,
      target_type: 'entry',
      label: 'produced',
    });
  }

  return { decisionIds, actionIds };
}

/**
 * Build payload from the meeting importer’s string arrays (AI extraction).
 */
export function payloadFromMeetingStrings(
  keyDecisions: string[],
  actionItems: string[],
): DecomposedMeetingPayload {
  return {
    decisions: keyDecisions.map((d, i) => ({
      title: d.trim().slice(0, 80) || `Decision ${i + 1}`,
      body: d.trim(),
    })),
    actionItems: actionItems.map((a, i) => ({
      title: a.trim().slice(0, 80) || `Action item ${i + 1}`,
      body: a.trim(),
    })),
  };
}
