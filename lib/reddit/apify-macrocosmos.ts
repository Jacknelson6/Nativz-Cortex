/**
 * Reddit via Apify macrocosmos/reddit-scraper (actor id RA1CgWSkuTRNdnOAY).
 * Cheaper pay-per-result than keyword-global actors; requires subreddit names.
 * We discover subreddits from SearXNG (same as legacy Reddit discovery), then scrape.
 *
 * @see https://apify.com/macrocosmos/reddit-scraper
 */

import {
  fetchApifyDatasetItems,
  startApifyActorRun,
  waitForApifyRunSuccess,
} from '@/lib/tiktok/apify-run';
import type { RedditComment, RedditPost, RedditSearchResult } from '@/lib/reddit/client';

const DEFAULT_ACTOR = 'macrocosmos/reddit-scraper';

function getActorId(): string {
  return (process.env.APIFY_REDDIT_ACTOR_ID ?? DEFAULT_ACTOR).trim();
}

function parseSort(): 'new' | 'hot' | 'top' | 'relevance' {
  const raw = (process.env.APIFY_REDDIT_SORT ?? 'top').toLowerCase();
  if (raw === 'new' || raw === 'hot' || raw === 'top' || raw === 'relevance') return raw;
  return 'top';
}

/** Target total posts to approximate across selected subreddits. */
function targetTotalPosts(volume: string): number {
  if (volume === 'deep') return 80;
  if (volume === 'medium') return 40;
  return 25;
}

/** Max subreddits to pass in one actor run (breadth vs depth). */
function maxSubreddits(volume: string): number {
  if (volume === 'deep') return 12;
  if (volume === 'medium') return 8;
  return 6;
}

function parseFallbackSubreddits(): string[] {
  const raw = process.env.APIFY_REDDIT_FALLBACK_SUBREDDITS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/^r\//i, ''))
    .filter(Boolean);
}

function parseIsoToUnix(s: string): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t / 1000 : 0;
}

function pathFromUrl(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function stripKind(id: string): string {
  return id.replace(/^t[13]_/, '');
}

/**
 * Pick subreddit names: SearXNG-derived frequency first, then env fallback.
 */
export async function pickSubredditsForApify(
  query: string,
  timeRange: string,
  volume: string,
): Promise<string[]> {
  const cap = maxSubreddits(volume);
  const fallback = parseFallbackSubreddits();

  let fromSearch: string[] = [];
  try {
    const { searchReddit } = await import('@/lib/reddit/client');
    const search = await searchReddit(query, timeRange, 80);
    fromSearch = search.topSubreddits.filter(Boolean).slice(0, cap);
  } catch {
    // SearXNG may be unavailable — continue with fallback
  }

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const s of [...fromSearch, ...fallback]) {
    const n = s.toLowerCase();
    if (seen.has(n)) continue;
    seen.add(n);
    merged.push(s);
    if (merged.length >= cap) break;
  }

  // If no subreddits found via search or fallback, use the query as a keyword search
  // by returning an empty array — the caller will use direct Reddit search instead
  return merged;
}

function parseMacrocosmosDataset(
  items: unknown[],
): (RedditPost & { top_comments: RedditComment[] })[] {
  const postsById = new Map<string, RedditPost>();
  const commentsByPost = new Map<string, RedditComment[]>();

  for (const raw of items) {
    const row = raw as Record<string, unknown>;
    const dt = row.dataType;
    const idRaw = String(row.id ?? '');

    if (dt === 'post') {
      const shortId = stripKind(idRaw);
      if (!shortId) continue;
      const communityName = String(row.communityName ?? '');
      const sub = communityName.replace(/^r\//, '').trim();
      const url = String(row.url ?? '');
      const path = pathFromUrl(url) || `/r/${sub}/comments/${shortId}/`;

      postsById.set(shortId, {
        id: shortId,
        title: String(row.title ?? ''),
        selftext: String(row.body ?? '').slice(0, 4000),
        score: Number(row.score ?? 0),
        num_comments: Number(row.num_comments ?? 0),
        url,
        permalink: path,
        subreddit: sub,
        created_utc: parseIsoToUnix(String(row.createdAt ?? '')),
        author: String(row.username ?? ''),
        link_flair_text: null,
      });
    } else if (dt === 'comment') {
      const parentId = String(row.parentId ?? '');
      const postPrefix = parentId.startsWith('t3_') ? parentId : '';
      const postShort = postPrefix.replace(/^t3_/, '');
      if (!postShort) continue;

      const c: RedditComment = {
        id: stripKind(idRaw),
        body: String(row.body ?? '').slice(0, 1000),
        score: Number(row.score ?? 0),
        author: String(row.username ?? ''),
        created_utc: parseIsoToUnix(String(row.createdAt ?? '')),
      };
      if (!commentsByPost.has(postShort)) commentsByPost.set(postShort, []);
      commentsByPost.get(postShort)!.push(c);
    }
  }

  const out: (RedditPost & { top_comments: RedditComment[] })[] = [];
  for (const [id, post] of postsById) {
    const tc = (commentsByPost.get(id) ?? []).slice(0, 25);
    out.push({ ...post, top_comments: tc });
  }

  out.sort((a, b) => b.score + b.num_comments - (a.score + a.num_comments));
  return out;
}

export async function gatherRedditViaMacrocosmosApify(
  query: string,
  timeRange: string,
  volume: string,
  apiKey: string,
): Promise<(RedditSearchResult & { postsWithComments: (RedditPost & { top_comments: RedditComment[] })[] }) | null> {
  let subreddits: string[] = [];
  try {
    subreddits = await pickSubredditsForApify(query, timeRange, volume);
  } catch {
    // SearXNG unavailable — proceed with keyword-only search
  }

  const totalTarget = targetTotalPosts(volume);
  const sort = parseSort();

  const input: Record<string, unknown> = {
    sort,
    keyword: query, // Always use query as keyword — works even without subreddits
  };

  if (subreddits.length > 0) {
    const limitPerSub = Math.min(100, Math.max(3, Math.ceil(totalTarget / subreddits.length)));
    input.subreddits = subreddits;
    input.limit = limitPerSub;
  } else {
    // No subreddits — use keyword search across all of Reddit
    input.limit = Math.min(100, totalTarget);
    console.log('[reddit-apify] No subreddits — running keyword-only search for:', query);
  }

  const actorId = getActorId();
  const runId = await startApifyActorRun(actorId, input, apiKey);
  if (!runId) return null;

  const maxWaitMs = volume === 'deep' ? 300000 : 180000;
  const ok = await waitForApifyRunSuccess(runId, apiKey, maxWaitMs, 3000);
  if (!ok) return null;

  const fetchLimit = Math.min(5000, Math.max(500, totalTarget * 30));
  const items = await fetchApifyDatasetItems(runId, apiKey, fetchLimit);
  let postsWithComments = parseMacrocosmosDataset(items);

  if (postsWithComments.length === 0) return null;

  const maxConversations =
    volume === 'deep' ? 80 : volume === 'medium' ? 40 : 25;
  postsWithComments = postsWithComments.slice(0, maxConversations);

  const subCounts: Record<string, number> = {};
  for (const p of postsWithComments) {
    if (p.subreddit) subCounts[p.subreddit] = (subCounts[p.subreddit] ?? 0) + 1;
  }
  const topSubreddits = Object.entries(subCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);

  const posts: RedditPost[] = postsWithComments.map(({ top_comments: _c, ...p }) => p);

  return {
    posts,
    topSubreddits,
    totalPosts: posts.length,
    postsWithComments,
  };
}
