/**
 * LLM-graded rubrics for the Bio and Caption components of the Spy
 * benchmarking score. Both run at temperature 0 with structured JSON output
 * so the same input always produces the same number — the score has to be
 * reproducible if leaderboards are going to mean anything week-over-week.
 *
 * Bio is IG-only (TikTok bios are too constrained to grade meaningfully).
 * Captions are graded as a sample (5–10 most recent) and averaged.
 */

import { createCompletion } from '@/lib/ai/client';

const FEATURE_BIO = 'spy/bio-rubric';
const FEATURE_CAPTION = 'spy/caption-rubric';

const BIO_SYSTEM = `You grade Instagram bios for short-form video brands using a strict 5-point rubric. The gold standard is a "Standard Ranch Water"-style IG bio: instantly clear what they sell, distinctive voice, concrete proof, strong CTA, well-paced layout.

Score each of the 5 criteria as 0 or 1:
1. CLARITY — A first-time visitor learns what the brand sells in 3 seconds.
2. VOICE — Has a distinctive point of view, not generic copy.
3. PROOF — Includes a concrete proof point (location, press, awards, scale, ingredients, customers).
4. CTA — Has a clear next step (link in bio, sale, drop, store finder, sign-up).
5. RHYTHM — Layout is intentional: emoji punctuate rather than decorate, line breaks land naturally, no wall of text.

Return JSON only:
{
  "clarity": 0|1,
  "voice": 0|1,
  "proof": 0|1,
  "cta": 0|1,
  "rhythm": 0|1,
  "rationale": "one sentence, max 25 words"
}`;

const CAPTION_SYSTEM = `You grade short-form video captions for engagement potential using a 3-point rubric.

For EACH caption, score:
1. LENGTH — body text (excluding hashtags) is 100–200 characters. 0 = too short or too long.
2. CTA — caption tells the viewer to do something specific (comment, save, share, follow, try, shop, ask). 0 = no CTA or generic "drop a 🔥".
3. HASHTAGS — has a relevant hashtag wall (3–7 niche-specific tags, not generic spam like #fyp #viral #foryoupage on its own).

Return JSON only:
{
  "captions": [
    { "id": "<id from input>", "length": 0|1, "cta": 0|1, "hashtags": 0|1, "score": 0..3 },
    ...
  ]
}`;

export interface BioBreakdown {
  clarity: 0 | 1;
  voice: 0 | 1;
  proof: 0 | 1;
  cta: 0 | 1;
  rhythm: 0 | 1;
  rationale: string;
}

export interface BioGrade {
  /** 0..100 — sum of the 5 boolean criteria scaled to 100. */
  score: number;
  breakdown: BioBreakdown;
}

export interface CaptionInput {
  id: string;
  text: string;
}

export interface CaptionBreakdown {
  id: string;
  length: 0 | 1;
  cta: 0 | 1;
  hashtags: 0 | 1;
  /** 0..3 sum of the three boolean criteria above. */
  score: 0 | 1 | 2 | 3;
}

export interface CaptionGrade {
  /** 0..100 — average of per-caption scores scaled to 100. */
  score: number;
  breakdown: CaptionBreakdown[];
}

/**
 * Grade an IG bio against the Standard Ranch Water rubric. Returns 0..100.
 * Empty / missing bio scores 0 with no LLM call.
 */
export async function gradeBio(bioText: string | null | undefined): Promise<BioGrade> {
  const trimmed = (bioText ?? '').trim();
  if (!trimmed) {
    return {
      score: 0,
      breakdown: { clarity: 0, voice: 0, proof: 0, cta: 0, rhythm: 0, rationale: 'No bio.' },
    };
  }

  const completion = await createCompletion({
    feature: FEATURE_BIO,
    maxTokens: 300,
    jsonMode: true,
    messages: [
      { role: 'system', content: BIO_SYSTEM },
      { role: 'user', content: `Bio:\n"""\n${trimmed}\n"""\n\nReturn JSON.` },
    ],
  });

  const parsed = parseJsonStrict(completion.text);
  const b: BioBreakdown = {
    clarity: toBit(parsed?.clarity),
    voice: toBit(parsed?.voice),
    proof: toBit(parsed?.proof),
    cta: toBit(parsed?.cta),
    rhythm: toBit(parsed?.rhythm),
    rationale: typeof parsed?.rationale === 'string' ? parsed.rationale.slice(0, 240) : '',
  };
  const sum = b.clarity + b.voice + b.proof + b.cta + b.rhythm;
  return { score: (sum / 5) * 100, breakdown: b };
}

/**
 * Grade up to 10 recent captions in a single LLM call. Empty / missing
 * captions are filtered before the call (they get a hard 0 rather than
 * burning tokens). Score is the average per-caption score scaled to 100.
 */
export async function gradeCaptions(captions: CaptionInput[]): Promise<CaptionGrade> {
  const cleaned = captions
    .map((c) => ({ id: c.id, text: (c.text ?? '').trim() }))
    .filter((c) => c.text.length > 0)
    .slice(0, 10);

  if (cleaned.length === 0) {
    return { score: 0, breakdown: [] };
  }

  const userPayload = cleaned
    .map((c, i) => `${i + 1}. id="${c.id}"\ntext: """${c.text}"""`)
    .join('\n\n');

  const completion = await createCompletion({
    feature: FEATURE_CAPTION,
    maxTokens: 800,
    jsonMode: true,
    messages: [
      { role: 'system', content: CAPTION_SYSTEM },
      { role: 'user', content: `${userPayload}\n\nReturn JSON.` },
    ],
  });

  const parsed = parseJsonStrict(completion.text);
  const rows = Array.isArray(parsed?.captions) ? parsed.captions : [];
  const breakdown: CaptionBreakdown[] = rows
    .map((r: unknown): CaptionBreakdown | null => {
      const row = r as Record<string, unknown>;
      if (!row || typeof row.id !== 'string') return null;
      const len = toBit(row.length);
      const cta = toBit(row.cta);
      const hash = toBit(row.hashtags);
      const score = (len + cta + hash) as 0 | 1 | 2 | 3;
      return { id: row.id, length: len, cta, hashtags: hash, score };
    })
    .filter((x: CaptionBreakdown | null): x is CaptionBreakdown => x !== null);

  if (breakdown.length === 0) return { score: 0, breakdown: [] };
  const totalPts = breakdown.reduce((sum, c) => sum + c.score, 0);
  const maxPts = breakdown.length * 3;
  return { score: (totalPts / maxPts) * 100, breakdown };
}

function toBit(v: unknown): 0 | 1 {
  return v === 1 || v === true || v === '1' ? 1 : 0;
}

function parseJsonStrict(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    // Defensive: some models wrap JSON in ```json fences despite jsonMode.
    const fenceMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }
}
