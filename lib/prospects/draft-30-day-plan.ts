// SPY-09 T02: LLM-draft a 3-item 30-day improvement plan from a prospect's
// analysis + scorecard. Sonnet 4.5 via OpenRouter, JSON-mode, temp 0.4.
// Returns exactly 3 ThirtyDayPlanItem objects. Caller persists into
// prospect_analyses.summary.thirty_day_plan.

import { z } from 'zod';
import { createCompletion } from '@/lib/ai/client';
import type { ScorecardSnapshot } from './checklist';
import type {
  ProspectAnalysisRow,
  ThirtyDayPlan,
  ThirtyDayPlanItem,
} from './types';

const SONNET_45 = 'anthropic/claude-sonnet-4.5';

const ItemSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(240),
  rationale: z.string().min(1).max(200),
});

// Slot for the array-only LLM output. We add the stable id ourselves.
const ItemsSchema = z.array(ItemSchema).length(3);

interface DraftInput {
  brandName: string;
  scorecard: ScorecardSnapshot;
  analysis: ProspectAnalysisRow;
}

const SYSTEM_PROMPT = `You are a short-form video content strategist drafting a 30-day improvement plan for a brand who just received an audit.

OUTPUT: exactly 3 plan items as a JSON array. Each item has:
- title: action-oriented, sentence case, <=80 chars, no em or en dashes.
- body: concrete steps, sentence case, <=240 chars.
- rationale: connect to a scored-R or scored-Y checklist item, <=200 chars.

RULES:
- Pick the 3 items with the highest impact divided by effort. Drop items already scoring G.
- Avoid jargon. Speak to a brand owner, not an agency.
- Never reference "long-form" or "YouTube long-form". Short-form vertical only.
- No em or en dashes. Use commas, periods, parens, or a regular hyphen.
- Output strictly the JSON array, no preamble, no trailing prose.`;

function buildUserPrompt(input: DraftInput): string {
  const scorecardJson = JSON.stringify(
    input.scorecard.items.map((i) => ({
      id: i.id,
      title: i.title,
      score: i.score,
      note: i.note,
    })),
  );
  const summary = {
    bio: input.analysis.bio_assessment,
    caption: input.analysis.caption_pattern,
    comments: input.analysis.comment_signal,
    cadence: input.analysis.posting_cadence,
    observations: input.analysis.observations,
    biggest_opportunity: input.analysis.biggest_opportunity,
  };
  return [
    `Brand name: ${input.brandName}`,
    `Scorecard (R/Y/G + notes): ${scorecardJson}`,
    `Analysis summary: ${JSON.stringify(summary)}`,
  ].join('\n\n');
}

function stableId(idx: number): string {
  return `action_${String(idx + 1).padStart(2, '0')}`;
}

/**
 * Strip stray prose around the JSON array the model might emit despite the
 * "no preamble" instruction. We only need a JSON array at the top level.
 */
function extractJsonArray(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) return trimmed;
  const first = trimmed.indexOf('[');
  const last = trimmed.lastIndexOf(']');
  if (first === -1 || last === -1 || last < first) {
    throw new Error('Model did not return a JSON array');
  }
  return trimmed.slice(first, last + 1);
}

export async function draft30DayPlan(input: DraftInput): Promise<ThirtyDayPlan> {
  const completion = await createCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    maxTokens: 1500,
    feature: 'spy_present_plan',
    modelPreference: [SONNET_45],
    jsonMode: true,
  });

  let parsedArray: unknown;
  try {
    parsedArray = JSON.parse(extractJsonArray(completion.text));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`30-day plan LLM returned invalid JSON: ${msg}`);
  }

  const items = ItemsSchema.parse(parsedArray);
  const stamped: ThirtyDayPlanItem[] = items.map((it, idx) => ({
    id: stableId(idx),
    title: it.title,
    body: it.body,
    rationale: it.rationale,
  }));

  return {
    generated_at: new Date().toISOString(),
    items: stamped,
    strategist_edited: false,
  };
}
