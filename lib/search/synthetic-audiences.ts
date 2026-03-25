import type { OceanScores, SyntheticAudienceSegment, SyntheticAudiences } from '@/lib/types/search';

function clampPct(n: unknown): number {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function normalizeOcean(raw: unknown): OceanScores | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    openness: clampPct(o.openness),
    conscientiousness: clampPct(o.conscientiousness),
    extraversion: clampPct(o.extraversion),
    agreeableness: clampPct(o.agreeableness),
    neuroticism: clampPct(o.neuroticism),
  };
}

function normalizeTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const tags = raw
    .filter((x): x is string => typeof x === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 48)
    .slice(0, 12);
  return tags.length > 0 ? tags : undefined;
}

function normalizeSegment(raw: unknown): SyntheticAudienceSegment | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const name = typeof s.name === 'string' ? s.name.trim() : '';
  if (name.length < 2 || name.length > 120) return null;
  const ocean = normalizeOcean(s.ocean);
  if (!ocean) return null;
  const emoji = typeof s.emoji === 'string' && s.emoji.trim() ? s.emoji.trim().slice(0, 12) : '🎯';
  const description =
    typeof s.description === 'string' && s.description.trim()
      ? s.description.trim().slice(0, 1200)
      : undefined;
  const rationale =
    typeof s.rationale === 'string' && s.rationale.trim() ? s.rationale.trim().slice(0, 600) : undefined;
  const interest_tags = normalizeTags(s.interest_tags);
  return {
    name,
    emoji,
    share_percent: clampPct(s.share_percent),
    ocean,
    ...(description ? { description } : {}),
    ...(interest_tags ? { interest_tags } : {}),
    ...(rationale ? { rationale } : {}),
  };
}

/**
 * Validates and clamps LLM output for synthetic_audiences. Returns null if unusable.
 */
export function normalizeSyntheticAudiences(raw: unknown): SyntheticAudiences | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const segmentsRaw = obj.segments;
  if (!Array.isArray(segmentsRaw)) return null;
  const segments = segmentsRaw.map(normalizeSegment).filter((x): x is SyntheticAudienceSegment => x !== null);
  if (segments.length === 0) return null;
  const intro =
    typeof obj.intro === 'string' && obj.intro.trim() ? obj.intro.trim().slice(0, 800) : undefined;
  return { intro, segments };
}
