/**
 * Helpers for loading flat "signals" out of attached topic_searches and
 * matching them to plan ideas. The point: the Nerd shouldn't be inventing
 * audience / sentiment / resonance stats — we have the real numbers. So
 * we extract them server-side and either expose them via the
 * `extract_topic_signals` tool or use them to enrich a `create_topic_plan`
 * call, overwriting whatever the model guessed.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface TopicSignal {
  /** Source topic_searches.id */
  search_id: string;
  /** Source topic_searches.query (the original search prompt) */
  search_query: string;
  /** Trending topic name — the canonical "source" string an idea points at */
  topic_name: string;
  /** Pre-built video idea hooks under this trending topic, if any */
  video_ideas: Array<{ title: string; hook: string; why_it_works?: string }>;
  /** Resonance bucket as reported by the search ('high' / 'medium' / 'low' / 'rising' / 'viral') */
  resonance?: string;
  /** -1..1 sentiment score on the trending topic */
  sentiment?: number;
  /** Audience size when reported on the search row (overall, not per topic) */
  search_audience?: number;
  /** Pos/neg sentiment percentages from the search-level emotion breakdown */
  positive_pct?: number;
  negative_pct?: number;
}

interface RawSearchRow {
  id: string;
  query: string;
  trending_topics: unknown;
  metrics: unknown;
  emotions: unknown;
}

interface RawTrendingTopic {
  name?: string;
  resonance?: string;
  sentiment?: number;
  posts_overview?: string;
  video_ideas?: Array<{ title: string; hook: string; why_it_works?: string }>;
}

interface RawEmotion {
  emotion?: string;
  percentage?: number;
}

interface RawMetrics {
  total_audience?: number;
  audience?: number;
  topic_score?: number;
}

/**
 * Load every trending topic across the given attached searches as a flat
 * list. Only completed searches contribute. Stats come from the actual
 * search row — we do not estimate.
 */
export async function loadTopicSignals(searchIds: string[]): Promise<TopicSignal[]> {
  if (searchIds.length === 0) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('topic_searches')
    .select('id, query, trending_topics, metrics, emotions')
    .in('id', searchIds)
    .eq('status', 'completed');

  if (error || !data) return [];

  const signals: TopicSignal[] = [];
  for (const row of data as RawSearchRow[]) {
    const metrics = (row.metrics ?? null) as RawMetrics | null;
    const emotions = (row.emotions ?? null) as RawEmotion[] | null;

    // Search-level stats — apply to every topic inside this search since the
    // per-topic numbers are usually only resonance + sentiment.
    const searchAudience =
      metrics?.total_audience ?? metrics?.audience ?? undefined;
    let positivePct: number | undefined;
    let negativePct: number | undefined;
    if (Array.isArray(emotions)) {
      // Bucket the emotion list. First pass uses exact-name matching against
      // broad POS/NEG sets; second pass falls back to substring matching so
      // variants like "joyful", "trust-positive", "anxious-negative" still
      // land somewhere. Search rows may also carry explicit positive /
      // negative rows which short-circuit all of this.
      const POS = new Set([
        'joy', 'love', 'interest', 'curiosity', 'admiration', 'positive', 'happiness',
        'excitement', 'hope', 'pride', 'trust', 'gratitude', 'relief', 'enthusiasm',
        'satisfaction', 'amusement', 'inspiration', 'confidence',
      ]);
      const NEG = new Set([
        'anger', 'fear', 'sadness', 'disgust', 'frustration', 'anxiety', 'negative',
        'disappointment', 'confusion', 'shame', 'regret', 'skepticism', 'contempt',
        'embarrassment', 'grief', 'worry', 'stress',
      ]);
      let pos = 0;
      let neg = 0;
      for (const e of emotions) {
        const name = (e.emotion ?? '').toLowerCase().trim();
        const pct = typeof e.percentage === 'number' ? e.percentage : 0;
        if (!name || pct === 0) continue;
        if (POS.has(name) || name.includes('positive')) {
          pos += pct;
        } else if (NEG.has(name) || name.includes('negative')) {
          neg += pct;
        } else {
          // Substring fallback — catches "joy_excitement", "mild-anger", etc.
          let matched = false;
          for (const p of POS) {
            if (name.includes(p)) { pos += pct; matched = true; break; }
          }
          if (!matched) {
            for (const n of NEG) {
              if (name.includes(n)) { neg += pct; break; }
            }
          }
        }
      }
      if (pos > 0) positivePct = Math.round(pos);
      if (neg > 0) negativePct = Math.round(neg);
    }

    const topics = (row.trending_topics ?? []) as RawTrendingTopic[];
    if (!Array.isArray(topics)) continue;

    for (const t of topics) {
      if (!t.name) continue;
      // Per-topic sentiment fallback: when emotions didn't bucket to useful
      // numbers, derive pos/neg pct from the topic's own sentiment score
      // (-1..1). +0.6 sentiment → ~80% positive. Only overrides when the
      // search-level bucketing produced zero, so the real emotion data
      // still wins when available.
      let topicPos = positivePct;
      let topicNeg = negativePct;
      if ((topicPos == null || topicPos === 0) && typeof t.sentiment === 'number') {
        const clamped = Math.max(-1, Math.min(1, t.sentiment));
        if (clamped > 0.1) {
          topicPos = Math.round(50 + clamped * 50);
          topicNeg = Math.round(50 - clamped * 50);
        } else if (clamped < -0.1) {
          topicNeg = Math.round(50 + Math.abs(clamped) * 50);
          topicPos = Math.round(50 - Math.abs(clamped) * 50);
        }
      }
      signals.push({
        search_id: row.id,
        search_query: row.query,
        topic_name: t.name,
        video_ideas: Array.isArray(t.video_ideas) ? t.video_ideas : [],
        resonance: t.resonance,
        sentiment: t.sentiment,
        search_audience: searchAudience,
        positive_pct: topicPos,
        negative_pct: topicNeg,
      });
    }
  }
  return signals;
}

/** Normalize a string for fuzzy matching — lowercase, collapse whitespace, drop punctuation. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Match an idea's `source` string against the loaded signals. Returns the
 * matched signal or null. Tolerant: exact, substring (either direction),
 * and shared-token-overlap matches all count.
 */
export function matchSignal(source: string | null | undefined, signals: TopicSignal[]): TopicSignal | null {
  if (!source) return null;
  const want = normalize(source);
  if (!want) return null;

  // 1. Exact / containment match (cheap, accurate for most cases).
  for (const sig of signals) {
    const have = normalize(sig.topic_name);
    if (have === want || have.includes(want) || want.includes(have)) return sig;
  }

  // 2. Token-overlap fallback — at least 60% of the shorter side's words.
  const wantTokens = new Set(want.split(' ').filter((w) => w.length > 2));
  if (wantTokens.size === 0) return null;
  let bestSig: TopicSignal | null = null;
  let bestOverlap = 0;
  for (const sig of signals) {
    const haveTokens = new Set(normalize(sig.topic_name).split(' ').filter((w) => w.length > 2));
    if (haveTokens.size === 0) continue;
    let overlap = 0;
    for (const t of wantTokens) if (haveTokens.has(t)) overlap += 1;
    const ratio = overlap / Math.min(wantTokens.size, haveTokens.size);
    if (ratio >= 0.6 && overlap > bestOverlap) {
      bestOverlap = overlap;
      bestSig = sig;
    }
  }
  return bestSig;
}
