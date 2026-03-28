import { parseAIResponseJSON } from '@/lib/ai/parse';
import { mergerOutputSchema, type MergerOutput } from '@/lib/search/llm-pipeline/schemas';

/**
 * Coerce merger LLM output into the shape expected by `mergerOutputSchema`.
 * Handles wrapped objects, string numbers, alias keys, and invalid optional enums.
 */
export function normalizeMergerPayload(raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    throw new Error('Merger model returned empty output.');
  }

  let obj: Record<string, unknown>;

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      throw new Error('Merger model returned an empty array.');
    }
    const first = raw[0];
    if (
      first &&
      typeof first === 'object' &&
      !Array.isArray(first) &&
      'name' in (first as object)
    ) {
      obj = {
        summary: 'Research summary synthesized from subtopics.',
        overall_sentiment: 0,
        conversation_intensity: 'moderate',
        topics: raw,
      };
    } else {
      throw new Error('Merger model returned an unexpected array shape.');
    }
  } else if (typeof raw === 'object') {
    obj = { ...(raw as Record<string, unknown>) };
  } else {
    throw new Error('Merger model returned non-object JSON.');
  }

  for (const key of ['report', 'merged_report', 'merge', 'result', 'data', 'output', 'content', 'response']) {
    const inner = obj[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const innerObj = inner as Record<string, unknown>;
      if (innerObj.summary !== undefined || innerObj.topics !== undefined) {
        obj = { ...innerObj, ...obj };
        break;
      }
    }
  }

  if (obj.trending_topics !== undefined && obj.topics === undefined) {
    obj.topics = obj.trending_topics;
  }

  // Double-encoded JSON string (some models return topics as a string)
  if (typeof obj.topics === 'string') {
    try {
      obj.topics = JSON.parse(obj.topics) as unknown;
    } catch {
      throw new Error('Merger model returned topics as invalid JSON string.');
    }
  }

  if (obj.topics && !Array.isArray(obj.topics) && typeof obj.topics === 'object') {
    obj.topics = [obj.topics];
  }

  if (obj.brand_alignment_notes === null) {
    delete obj.brand_alignment_notes;
  }

  const os = obj.overall_sentiment;
  let n = typeof os === 'string' ? parseFloat(os) : typeof os === 'number' ? os : NaN;
  if (!Number.isFinite(n)) n = 0;
  obj.overall_sentiment = Math.max(-1, Math.min(1, n));

  obj.conversation_intensity = normalizeConversationIntensity(obj.conversation_intensity);

  // Summary: allow array of strings or non-string (coerce)
  if (Array.isArray(obj.summary)) {
    obj.summary = (obj.summary as unknown[])
      .map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
      .join('\n');
  } else if (obj.summary != null && typeof obj.summary !== 'string') {
    obj.summary =
      typeof obj.summary === 'number' || typeof obj.summary === 'boolean'
        ? String(obj.summary)
        : JSON.stringify(obj.summary);
  }

  // Preserve LLM-analyzed aggregate fields (pass through to Zod; optional)
  if (Array.isArray(obj.emotions)) {
    obj.emotions = obj.emotions.filter(
      (e: unknown) => e && typeof e === 'object' && 'emotion' in (e as Record<string, unknown>),
    );
    if ((obj.emotions as unknown[]).length === 0) delete obj.emotions;
  }
  // content_breakdown and platform_breakdown are passed through as-is for Zod validation

  const topics = obj.topics;
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error('Merger model returned no topics.');
  }
  obj.topics = topics.map(normalizeTopicItem).slice(0, 12);

  if (typeof obj.summary !== 'string' || !obj.summary.trim()) {
    obj.summary = 'Summary of merged research.';
  }

  return obj;
}

function normalizeConversationIntensity(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.round(v);
    const byNum: Record<number, string> = {
      1: 'low',
      2: 'moderate',
      3: 'high',
      4: 'very_high',
    };
    return byNum[n] ?? 'moderate';
  }
  if (typeof v !== 'string') return 'moderate';
  const x = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const map: Record<string, string> = {
    veryhigh: 'very_high',
    very_high: 'very_high',
  };
  const key = map[x] ?? x;
  const allowed = new Set(['low', 'moderate', 'high', 'very_high']);
  return allowed.has(key) ? key : 'moderate';
}

function normalizeTopicItem(item: unknown): unknown {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return {
      name: 'Topic',
      why_trending: '',
      platforms_seen: [],
      posts_overview: '',
      comments_overview: '',
    };
  }
  const t = { ...(item as Record<string, unknown>) };
  const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
  const arrStr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v
          .map((x) => (typeof x === 'string' ? x : x != null ? String(x) : ''))
          .filter((s) => s.length > 0)
      : [];

  if (typeof t.name !== 'string' || !t.name.trim()) {
    const alt =
      typeof t.topic === 'string'
        ? t.topic
        : typeof t.title === 'string'
          ? t.title
          : typeof t.topic_name === 'string'
            ? t.topic_name
            : '';
    t.name = alt.trim() || 'Topic';
  }
  t.why_trending = str(t.why_trending);
  t.platforms_seen = arrStr(t.platforms_seen);
  t.posts_overview = str(t.posts_overview);
  t.comments_overview = str(t.comments_overview);

  if (Array.isArray(t.source_urls)) {
    t.source_urls = t.source_urls.filter((u) => typeof u === 'string');
  }

  // Preserve LLM-analyzed per-topic fields
  if (typeof t.resonance === 'string') {
    const allowed = new Set(['low', 'medium', 'high', 'viral']);
    if (!allowed.has(t.resonance)) delete t.resonance;
  }
  if (typeof t.sentiment === 'string') t.sentiment = parseFloat(t.sentiment as string);
  if (typeof t.sentiment === 'number' && Number.isFinite(t.sentiment)) {
    t.sentiment = Math.max(-1, Math.min(1, t.sentiment));
  } else {
    delete t.sentiment;
  }
  if (typeof t.estimated_engagement === 'string') t.estimated_engagement = parseFloat(t.estimated_engagement as string);
  if (typeof t.estimated_engagement === 'number' && Number.isFinite(t.estimated_engagement)) {
    t.estimated_engagement = Math.max(0, t.estimated_engagement);
  } else {
    delete t.estimated_engagement;
  }

  if (Array.isArray(t.video_ideas)) {
    t.video_ideas = t.video_ideas
      .filter((vi) => vi && typeof vi === 'object' && !Array.isArray(vi))
      .map((vi) => sanitizeVideoIdea(vi as Record<string, unknown>));
  }

  return t;
}

function sanitizeVideoIdea(v: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const rawTitle = v.title;
  if (typeof rawTitle === 'string' && rawTitle.trim()) {
    out.title = rawTitle;
  } else if (rawTitle != null && (typeof rawTitle === 'number' || typeof rawTitle === 'boolean')) {
    out.title = String(rawTitle);
  } else {
    out.title = 'Video idea';
  }

  for (const key of ['hook', 'description', 'format', 'why_it_works'] as const) {
    const val = v[key];
    if (val === undefined || val === null) continue;
    if (typeof val === 'string') out[key] = val;
    else if (typeof val === 'number' || typeof val === 'boolean') out[key] = String(val);
  }

  if (typeof v.virality === 'string') {
    const x = v.virality.toLowerCase().replace(/\s+/g, '_');
    const allowed = new Set(['viral_potential', 'high', 'medium', 'low']);
    if (allowed.has(x)) out.virality = x;
    else if (x === 'very_high' || x === 'veryhigh') out.virality = 'high';
  }

  return out;
}

/** Parse JSON → normalize → Zod. Logs Zod issues for debugging. */
export function parseMergerOutput(
  rawText: string,
  log: (event: Record<string, unknown>) => void,
): MergerOutput {
  let parsedJson: unknown;
  try {
    parsedJson = parseAIResponseJSON<unknown>(rawText);
  } catch (e) {
    log({
      merger_phase: 'json_parse',
      error: e instanceof Error ? e.message : String(e),
      preview: rawText.slice(0, 400),
    });
    throw new Error(
      e instanceof Error ? e.message : 'Merger model output was not valid JSON. Try again.',
    );
  }

  let normalized: unknown;
  try {
    normalized = normalizeMergerPayload(parsedJson);
  } catch (e) {
    log({
      merger_phase: 'normalize',
      error: e instanceof Error ? e.message : String(e),
      preview: rawText.slice(0, 400),
    });
    throw new Error(
      e instanceof Error ? e.message : 'Merger model returned an unexpected shape. Try again.',
    );
  }

  const result = mergerOutputSchema.safeParse(normalized);
  if (!result.success) {
    const flat = result.error.flatten();
    log({
      merger_phase: 'zod',
      issues: flat,
      preview: rawText.slice(0, 500),
    });
    console.error('[topic_search_llm_v1] merger Zod failure', JSON.stringify(flat), rawText.slice(0, 800));
    throw new Error('Merger model returned invalid JSON. Try again.');
  }

  return result.data;
}
