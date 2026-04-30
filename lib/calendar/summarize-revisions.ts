import { createCompletion } from '@/lib/ai/client';

/**
 * Convert reviewer change-request quotes into past-tense action bullets that
 * describe what the editing team *did*. Used by the "Notify Client" email
 * (the share-link revised-videos notification) so the client reads a clean
 * recap of the round of edits instead of their own original asks bounced
 * back at them.
 *
 * Returns:
 *   • [] if no change requests on file (caller renders the soft fallback line)
 *   • ['We took care of all of your requested revisions.'] on any AI error or
 *     when the model returns nothing parseable, the user's preferred
 *     "we hit all your revisions" fallback so the email still ships clean.
 *   • Otherwise: the parsed bullet list (≤ 8 items, each one short past-tense
 *     statement starting with a verb).
 */
const FALLBACK_BULLETS = ['We took care of all of your requested revisions.'];
const MAX_BULLETS = 8;

export async function summarizeRevisionEdits(
  changeRequests: string[],
): Promise<string[]> {
  const cleaned = changeRequests
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (cleaned.length === 0) return [];

  const numbered = cleaned.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const systemPrompt = `You are an editor on a creative agency's content team writing a short recap for a client. The client previously left a list of revision notes. Your job: rewrite each note as a single short past-tense bullet describing what the editing team DID about it (not what the client asked for).

Rules:
- One bullet per distinct change. Merge near-duplicates.
- Start each bullet with an action verb in past tense ("Removed", "Trimmed", "Replaced", "Re-shot", "Tightened", "Cut", "Re-cut", "Adjusted", "Updated").
- Keep each bullet under 120 characters. Plain language. No quotes, no client name, no preamble.
- If a note is vague ("can we tweak it?"), translate it into a generic action like "Re-cut the clip per your note".
- Maximum ${MAX_BULLETS} bullets total.
- Output JSON only: {"bullets": ["...", "..."]}. No commentary, no markdown.`;

  const userPrompt = `Reviewer notes for this round of revisions:\n\n${numbered}\n\nReturn the JSON.`;

  try {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 600,
      jsonMode: true,
      feature: 'calendar_revised_videos_summary',
    });

    const text = (result.text ?? '').trim();
    if (!text) return FALLBACK_BULLETS;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // The model occasionally wraps JSON in ```json fences even with jsonMode.
      const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
      if (fenced) {
        try {
          parsed = JSON.parse(fenced[1]);
        } catch {
          return FALLBACK_BULLETS;
        }
      } else {
        return FALLBACK_BULLETS;
      }
    }

    const bullets = (parsed as { bullets?: unknown }).bullets;
    if (!Array.isArray(bullets)) return FALLBACK_BULLETS;

    const finalBullets = bullets
      .filter((b): b is string => typeof b === 'string')
      .map((b) => b.trim())
      .filter((b) => b.length > 0)
      .slice(0, MAX_BULLETS);

    if (finalBullets.length === 0) return FALLBACK_BULLETS;
    return finalBullets;
  } catch (err) {
    console.error('[summarizeRevisionEdits] AI call failed:', err);
    return FALLBACK_BULLETS;
  }
}
