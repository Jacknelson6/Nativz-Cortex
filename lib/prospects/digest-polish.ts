// SPY-10 T07: low-temp Sonnet 4.5 polish for digest subject + opening.
//
// Deterministic structured payload in, JSON {"subject","opening"} out.
// Falls back to a templated string on any failure so the cron never blocks.

import { createCompletion } from '@/lib/ai/client';
import type {
  DigestKind,
  WeeklyCompetitorPayload,
  MonthlyFormatPayload,
} from './types';

const SONNET_45 = 'anthropic/claude-sonnet-4.5';

const SYSTEM = `You are an email copywriter polishing a B2B prospecting digest. The reader is a brand owner who got an audit from Nativz a few weeks ago but hasn't signed yet.

TASK:
- Write ONE subject line (<=60 chars) and ONE opening paragraph (<=400 chars).
- Subject must reference what's new without being clickbaity.
- Opening must be warm, specific to brand_name, and lead into the highlights below.
- Sentence case. No em or en dashes. No exclamation marks. Never use the word "drops" (use "posts" instead).
- Output strictly JSON {"subject": "...", "opening": "..."}.`;

export interface DigestPolishInput {
  brandName: string;
  kind: DigestKind;
  payload: WeeklyCompetitorPayload | MonthlyFormatPayload;
}

export interface DigestPolishResult {
  subject: string;
  opening: string;
  fallback: boolean;
}

function clampSubject(s: string): string {
  const t = s.replace(/[–—]/g, '-').replace(/[!]+/g, '.').trim();
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
}

function clampOpening(s: string): string {
  const t = s.replace(/[–—]/g, '-').replace(/[!]+/g, '.').trim();
  return t.length > 400 ? `${t.slice(0, 397)}...` : t;
}

function fallbackForKind(brandName: string, kind: DigestKind): DigestPolishResult {
  if (kind === 'weekly_competitor') {
    return {
      subject: clampSubject(`What's new with ${brandName}'s competitors this week`),
      opening: clampOpening(
        `Hi ${brandName} team, here's a quick summary of what moved in your competitor landscape over the last seven days. We pulled the three highlights worth your attention.`,
      ),
      fallback: true,
    };
  }
  return {
    subject: clampSubject(`Top short-form formats for ${brandName} this month`),
    opening: clampOpening(
      `Hi ${brandName} team, here are the five short-form formats trending in your space over the last 30 days. Lift the patterns that fit your audience.`,
    ),
    fallback: true,
  };
}

function extractJson(text: string): unknown | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Try to find first { ... } block.
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function digestPolish(input: DigestPolishInput): Promise<DigestPolishResult> {
  try {
    const user = JSON.stringify({
      brand_name: input.brandName,
      kind: input.kind,
      payload: input.payload,
    });
    const res = await createCompletion({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
      modelPreference: [SONNET_45],
      jsonMode: true,
      maxTokens: 600,
      feature: 'spy_digest_polish',
    });
    const parsed = extractJson(res.text);
    if (!parsed || typeof parsed !== 'object') return fallbackForKind(input.brandName, input.kind);
    const obj = parsed as { subject?: unknown; opening?: unknown };
    const subject = typeof obj.subject === 'string' ? obj.subject : '';
    const opening = typeof obj.opening === 'string' ? obj.opening : '';
    if (!subject || !opening) return fallbackForKind(input.brandName, input.kind);
    return {
      subject: clampSubject(subject),
      opening: clampOpening(opening),
      fallback: false,
    };
  } catch {
    return fallbackForKind(input.brandName, input.kind);
  }
}
