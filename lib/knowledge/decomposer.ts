/**
 * LLM decomposition for meeting-style markdown when structured extraction
 * was not already run (e.g. Fyxer email import).
 */

import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { DecomposedMeetingPayload } from './ingestion-pipeline';

const SYSTEM = `You extract structured knowledge from meeting notes or transcripts.
Return JSON only (no markdown fences) with this shape:
{
  "decisions": [ { "title": "short label", "body": "full decision text" } ],
  "actionItems": [ { "title": "short label", "body": "task description", "owner": "name or null" } ]
}
Rules:
- If there are no clear decisions, return an empty decisions array.
- If there are no action items, return an empty actionItems array.
- Titles should be under 80 characters.
- Do not duplicate the same decision or action twice.`;

/**
 * Extract decisions and action items from raw meeting markdown/transcript.
 */
export async function extractMeetingDecompositionFromMarkdown(
  markdown: string,
): Promise<DecomposedMeetingPayload> {
  const empty: DecomposedMeetingPayload = { decisions: [], actionItems: [] };
  const text = (markdown ?? '').trim();
  if (text.length < 40) return empty;

  try {
    const response = await createCompletion({
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Meeting notes:\n${text.slice(0, 14_000)}`,
        },
      ],
      maxTokens: 2000,
      feature: 'knowledge_meeting_decompose',
    });

    const parsed = parseAIResponseJSON<{
      decisions?: Array<{ title?: string; body?: string }>;
      actionItems?: Array<{ title?: string; body?: string; owner?: string | null }>;
    }>(response.text);

    const decisions = (parsed.decisions ?? [])
      .map((d) => ({
        title: (d.title ?? d.body ?? '').trim().slice(0, 80) || 'Decision',
        body: (d.body ?? d.title ?? '').trim(),
      }))
      .filter((d) => d.body.length > 0);

    const actionItems = (parsed.actionItems ?? [])
      .map((a) => ({
        title: (a.title ?? a.body ?? '').trim().slice(0, 80) || 'Action item',
        body: (a.body ?? a.title ?? '').trim(),
        owner: a.owner && String(a.owner).trim() ? String(a.owner).trim() : undefined,
      }))
      .filter((a) => a.body.length > 0);

    return { decisions, actionItems };
  } catch (e) {
    console.error('[decomposer] extractMeetingDecompositionFromMarkdown failed:', e);
    return empty;
  }
}
