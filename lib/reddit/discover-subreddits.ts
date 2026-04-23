/**
 * Subreddit discovery via a tiny LLM call.
 *
 * Input: a topic query (+ optional subtopics for extra context).
 * Output: 5–8 relevant subreddit slugs (no `r/` prefix).
 *
 * Used by the macrocosmos Reddit path so our keyword search narrows to
 * communities that actually care about the topic. Cheaper than a full
 * Reddit scrape AND higher-signal.
 *
 * Falls back to an empty list on any error — macrocosmos then does a pure
 * keyword search across all of Reddit.
 */

const CACHE = new Map<string, { subs: string[]; at: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — topic→subreddit mapping is stable

function cacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function discoverSubredditsForTopic(
  query: string,
  subtopics: string[] = [],
  opts: { apiKey?: string; model?: string } = {},
): Promise<string[]> {
  const k = cacheKey(query);
  const hit = CACHE.get(k);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.subs;
  }

  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  // Tiny, well-bounded task (pick 5–8 subreddit names) — use the cheapest
  // tier in the routing policy. GPT-5.4 Nano at $0.20/$1.25 per 1M is ~3–4×
  // cheaper than GPT-5.4 Mini and more than capable of producing a short
  // JSON array. Env override via SUBREDDIT_DISCOVERY_MODEL kept for ops.
  const model =
    opts.model ?? process.env.SUBREDDIT_DISCOVERY_MODEL?.trim() ?? 'openai/gpt-5.4-nano';

  const prompt = buildPrompt(query, subtopics);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[discoverSubreddits] LLM ${res.status} — falling back to empty list`);
      return [];
    }
    const j = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = j.choices?.[0]?.message?.content ?? '';
    const subs = parseSubredditList(text);

    CACHE.set(k, { subs, at: Date.now() });
    return subs;
  } catch (err) {
    console.warn('[discoverSubreddits] threw — falling back:', err);
    return [];
  }
}

function buildPrompt(query: string, subtopics: string[]): string {
  const subtopicLines = subtopics.length
    ? `\nRelated subtopics that may help pick the right communities:\n${subtopics.map((s) => `- ${s}`).join('\n')}\n`
    : '';
  return `Pick the 5–8 most relevant subreddits where people actively discuss this topic.

Topic: "${query}"
${subtopicLines}
Rules:
- Return ONLY a JSON array of subreddit names, no prose, no explanation.
- Use bare names WITHOUT the "r/" prefix (e.g. "personalfinance", not "r/personalfinance").
- Prefer active, real subreddits you are confident exist.
- If the topic is niche, include 2–3 broader communities where it still gets discussed.
- NEVER invent subreddit names.

Example output: ["personalfinance","Frugal","Money","investing"]

Your answer:`;
}

function parseSubredditList(text: string): string[] {
  // Find the first [...] block and parse it.
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    const clean = arr
      .map((v) => (typeof v === 'string' ? v.replace(/^r\//i, '').trim() : ''))
      .filter((s) => /^[A-Za-z0-9_]{2,30}$/.test(s));
    // Dedupe + cap at 8
    return Array.from(new Set(clean)).slice(0, 8);
  } catch {
    return [];
  }
}
