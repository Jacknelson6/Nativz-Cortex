/**
 * Reddit via Apify macrocosmos/reddit-scraper.
 *
 * Per Jack's 2026-04-23 call after the $37 Apify bill spike: this actor is
 * ~7.6× cheaper per item than trudax/reddit-scraper-lite ($0.0005 vs $0.0038)
 * and for the topic-search use case (post discovery, not deep comment
 * analysis) it produces plenty of signal.
 *
 * Trade-off: macrocosmos returns posts only — no comments. The summariser
 * can still extract intent / pain points from post titles + bodies. If a
 * caller specifically needs comment threads, they should route through
 * lib/reddit/apify-trudax instead.
 *
 * Input shape (confirmed via a real 2026-04-23 run):
 *   { keyword: string, limit: number, sort: 'top' | 'hot' | 'new',
 *     subreddits: string[]  // bare names, e.g. "Python"; empty OK }
 *
 * Output items have: { url, id (t3_…), title, body, ... }
 *
 * Actor docs: https://apify.com/macrocosmos/reddit-scraper
 */

import {
  startApifyActorRun,
  waitForApifyRunSuccess,
  fetchApifyDatasetItems,
} from '@/lib/tiktok/apify-run';
import { recordApifyRun } from '@/lib/apify/record-run';
import type { RedditPost, RedditComment, RedditSearchResult } from '@/lib/reddit/client';

const DEFAULT_ACTOR = 'macrocosmos/reddit-scraper';
// Hard ceiling per run. At ~$0.0005/item this caps a single run at ~$0.25.
const HARD_LIMIT = 250;

function getActorId(): string {
  return (process.env.APIFY_REDDIT_MACROCOSMOS_ACTOR_ID ?? DEFAULT_ACTOR).trim();
}

function stripRedditIdPrefix(id: unknown): string {
  return typeof id === 'string' ? id.replace(/^t[13]_/, '') : '';
}

function stripSubPrefix(community: unknown): string {
  return typeof community === 'string' ? community.replace(/^r\//i, '').trim() : '';
}

/** Parse the flat macrocosmos dataset into our canonical RedditPost shape. */
function parseMacrocosmosDataset(items: unknown[]): RedditPost[] {
  const out: RedditPost[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;

    const id = stripRedditIdPrefix(row.id) || String(row.parsedId ?? '');
    const title = String(row.title ?? '').trim();
    if (!id || !title) continue;

    const url = String(row.url ?? '');
    const body = String(row.body ?? row.selftext ?? '').slice(0, 4000);

    // macrocosmos exposes the community on .community or infers from URL
    let subreddit = stripSubPrefix(row.community ?? row.subreddit ?? '');
    if (!subreddit && url) {
      const match = url.match(/reddit\.com\/r\/([^/]+)/i);
      if (match) subreddit = match[1];
    }

    let permalink = '';
    try {
      permalink = url ? new URL(url).pathname : `/r/${subreddit}/comments/${id}/`;
    } catch {
      permalink = `/r/${subreddit}/comments/${id}/`;
    }

    const createdAt = row.createdAt ?? row.created_utc ?? row.created;
    const created_utc =
      typeof createdAt === 'string'
        ? Math.floor(Date.parse(createdAt) / 1000) || 0
        : typeof createdAt === 'number'
          ? createdAt > 1e12
            ? Math.floor(createdAt / 1000)
            : Math.floor(createdAt)
          : 0;

    out.push({
      id,
      title,
      selftext: body,
      score: Number(row.score ?? row.upVotes ?? 0),
      num_comments: Number(row.numberOfComments ?? row.num_comments ?? 0),
      url,
      permalink,
      subreddit,
      created_utc,
      author: String(row.author ?? row.username ?? '[deleted]'),
      link_flair_text: (row.flair as string) ?? null,
    });
  }
  return out;
}

export async function gatherRedditViaMacrocosmosApify(
  query: string,
  apiKey: string,
  opts: {
    subreddits?: string[];
    limit?: number;
    sort?: 'top' | 'hot' | 'new';
    runContext?: { topicSearchId?: string | null; clientId?: string | null };
  } = {},
): Promise<(RedditSearchResult & { postsWithComments: (RedditPost & { top_comments: RedditComment[] })[] }) | null> {
  const actorId = getActorId();
  const limit = Math.min(HARD_LIMIT, Math.max(1, opts.limit ?? 150));
  const runContext = opts.runContext ?? {};

  const input: Record<string, unknown> = {
    keyword: query,
    limit,
    sort: opts.sort ?? 'top',
    // Pass an empty list when no subreddits were discovered — the actor
    // falls back to keyword search across all of Reddit. Non-empty list
    // narrows the search which is both cheaper and more targeted.
    subreddits: opts.subreddits ?? [],
  };

  const runId = await startApifyActorRun(actorId, input, apiKey);
  if (!runId) {
    await recordApifyRun({
      runId: '',
      actorId,
      apiKey,
      context: { purpose: 'reddit_macrocosmos', ...runContext },
      startFailure: { error: `Actor ${actorId} failed to start` },
    });
    return null;
  }

  // macrocosmos tends to finish in <60s even at 250-item limit
  const ok = await waitForApifyRunSuccess(runId, apiKey, 90_000, 2000);

  await recordApifyRun({
    runId,
    actorId,
    apiKey,
    context: { purpose: 'reddit_macrocosmos', ...runContext },
  });

  if (!ok) return null;

  const items = await fetchApifyDatasetItems(runId, apiKey, Math.min(500, limit * 2));
  let posts = parseMacrocosmosDataset(items);
  if (posts.length === 0) return null;

  // Rank by hot-ish composite (upvotes + 2×comments) so the summary sees the
  // most active threads first.
  posts.sort((a, b) => b.score + b.num_comments * 2 - (a.score + a.num_comments * 2));
  posts = posts.slice(0, limit);

  const subCounts: Record<string, number> = {};
  for (const p of posts) {
    if (p.subreddit) subCounts[p.subreddit] = (subCounts[p.subreddit] ?? 0) + 1;
  }
  const topSubreddits = Object.entries(subCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);

  // macrocosmos doesn't return comments — satisfy the shared return shape
  // by pairing each post with an empty top_comments list.
  const postsWithComments = posts.map((p) => ({ ...p, top_comments: [] as RedditComment[] }));

  return {
    posts,
    topSubreddits,
    totalPosts: posts.length,
    postsWithComments,
  };
}
