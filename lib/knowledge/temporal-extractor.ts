/**
 * Temporal marker extraction from knowledge entry content.
 *
 * Uses an LLM (Haiku-class for speed/cost) to detect dates, decision language,
 * and guideline markers in free-form text, returning structured temporal metadata.
 */

import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemporalExtractionResult {
  markers: import('./types').TemporalMarker[];
  validFrom: string | null;
  validUntil: string | null;
  isDecision: boolean;
  isGuideline: boolean;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a temporal analysis assistant. Given a knowledge entry (title + content), extract temporal information.

Return JSON with this exact shape:
{
  "markers": [
    {
      "type": "valid_from" | "valid_until" | "supersedes" | "contradicts" | "as_of",
      "value": "<ISO date string or descriptive text>",
      "source_text": "<the original text that triggered this marker>",
      "confidence": <0.0 to 1.0>
    }
  ],
  "validFrom": "<ISO date if a start date is detected, else null>",
  "validUntil": "<ISO date if an end date is detected, else null>",
  "isDecision": <true if the content records a decision>,
  "isGuideline": <true if the content establishes a guideline or policy>
}

Detection rules:
- Explicit dates: "as of March 2026", "effective immediately", "until Q3 review", "starting next month"
- Temporal language: "replacing the previous", "updating our approach", "going forward", "no longer"
- Decision markers: "we decided to", "the team agreed", "action item:", "approved by"
- Guideline markers: "our policy is", "brand standard", "always use", "never use", "must be"
- If no temporal markers are found, return empty markers array and null dates
- Convert relative dates to ISO 8601 when possible (use today's date as reference)
- Set confidence based on how explicit the temporal signal is (0.9+ for explicit dates, 0.5-0.8 for implied)`;

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extract temporal markers from knowledge entry content using an LLM.
 * Returns structured temporal metadata including validity dates and marker types.
 */
export async function extractTemporalMarkers(
  content: string,
  existingTitle?: string,
): Promise<TemporalExtractionResult> {
  const empty: TemporalExtractionResult = {
    markers: [],
    validFrom: null,
    validUntil: null,
    isDecision: false,
    isGuideline: false,
  };

  // Skip very short content — not enough signal
  if (!content || content.trim().length < 30) return empty;

  try {
    const userMessage = existingTitle
      ? `Title: ${existingTitle}\n\nContent:\n${content.slice(0, 4000)}`
      : `Content:\n${content.slice(0, 4000)}`;

    const response = await createCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      maxTokens: 1024,
      feature: 'knowledge_temporal_extraction',
      modelPreference: ['anthropic/claude-haiku', 'anthropic/claude-3-haiku'],
    });

    const parsed = parseAIResponseJSON<TemporalExtractionResult>(response.text);

    return {
      markers: parsed.markers ?? [],
      validFrom: parsed.validFrom ?? null,
      validUntil: parsed.validUntil ?? null,
      isDecision: parsed.isDecision ?? false,
      isGuideline: parsed.isGuideline ?? false,
    };
  } catch (error) {
    console.error('Temporal extraction failed (non-blocking):', error);
    return empty;
  }
}
