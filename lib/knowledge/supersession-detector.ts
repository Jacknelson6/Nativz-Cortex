/**
 * Supersession detection for knowledge entries.
 *
 * When a new entry is ingested, checks existing entries for semantic overlap
 * and uses an LLM to determine if the new entry supersedes or contradicts them.
 */

import { createCompletion } from '@/lib/ai/client';
import { DEFAULT_OPENROUTER_MODEL } from '@/lib/ai/openrouter-default-model';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { searchKnowledge } from './search';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SupersessionMatch {
  entryId: string;
  reason: string;
  confidence: number;
}

export interface SupersessionResult {
  supersedes: SupersessionMatch[];
  contradicts: SupersessionMatch[];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a knowledge consistency analyst. Given a NEW knowledge entry and an EXISTING entry, determine their relationship.

Return JSON with this exact shape:
{
  "relationship": "supersedes" | "contradicts" | "none",
  "reason": "<one-sentence explanation>",
  "confidence": <0.0 to 1.0>
}

Rules:
- "supersedes": The new entry provides updated information that replaces the existing entry (newer version, updated policy, revised guideline)
- "contradicts": The new entry conflicts with the existing entry but doesn't explicitly replace it (different conclusions, conflicting data)
- "none": The entries are related but neither supersedes nor contradicts the other
- Set confidence 0.9+ only for very clear supersession/contradiction (explicit "replacing", same topic with newer date)
- Set confidence 0.5-0.8 for implied relationships (similar topic, different conclusions)
- Set confidence below 0.5 for weak or uncertain relationships`;

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

/**
 * Detect if a new knowledge entry supersedes or contradicts existing entries.
 * Searches for semantically similar entries, then uses an LLM to classify relationships.
 */
export async function detectSupersessions(
  clientId: string,
  newEntry: {
    title: string;
    content: string;
    type: string;
    metadata: Record<string, unknown>;
  },
  options?: { excludeEntryIds?: string[] },
): Promise<SupersessionResult> {
  const empty: SupersessionResult = { supersedes: [], contradicts: [] };
  const exclude = new Set(options?.excludeEntryIds ?? []);

  try {
    // Find semantically similar existing entries
    const searchQuery = `${newEntry.title} ${newEntry.content.slice(0, 500)}`;
    const similar = await searchKnowledge(clientId, searchQuery, {
      limit: 8,
      threshold: 0.4,
    });

    const filtered = similar.filter((s) => !exclude.has(s.id));
    if (filtered.length === 0) return empty;

    // Compare new entry against each similar entry in parallel
    const comparisons = await Promise.all(
      filtered.map(async (existing) => {
        try {
          const response = await createCompletion({
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              {
                role: 'user',
                content: `NEW ENTRY:\nTitle: ${newEntry.title}\nType: ${newEntry.type}\nContent: ${newEntry.content.slice(0, 2000)}\n\nEXISTING ENTRY:\nTitle: ${existing.title}\nType: ${existing.type}\nContent: ${existing.content.slice(0, 2000)}`,
              },
            ],
            maxTokens: 256,
            feature: 'knowledge_supersession_detection',
            modelPreference: [DEFAULT_OPENROUTER_MODEL],
          });

          const parsed = parseAIResponseJSON<{
            relationship: 'supersedes' | 'contradicts' | 'none';
            reason: string;
            confidence: number;
          }>(response.text);

          return {
            entryId: existing.id,
            relationship: parsed.relationship ?? 'none',
            reason: parsed.reason ?? '',
            confidence: parsed.confidence ?? 0,
          };
        } catch {
          return null;
        }
      }),
    );

    const result: SupersessionResult = { supersedes: [], contradicts: [] };

    for (const comp of comparisons) {
      if (!comp || comp.relationship === 'none') continue;
      const match: SupersessionMatch = {
        entryId: comp.entryId,
        reason: comp.reason,
        confidence: comp.confidence,
      };
      if (comp.relationship === 'supersedes') {
        result.supersedes.push(match);
      } else if (comp.relationship === 'contradicts') {
        result.contradicts.push(match);
      }
    }

    return result;
  } catch (error) {
    console.error('Supersession detection failed (non-blocking):', error);
    return empty;
  }
}
