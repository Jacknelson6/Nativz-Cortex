/**
 * Reddit via Apify trudax/reddit-scraper-lite.
 *
 * Strategy (per Jack's spec, 2026-04-23):
 *   - Search all of Reddit by keyword. No subreddit discovery — we never
 *     guess subreddit names to avoid LLM hallucinations that waste tokens
 *     and burn scraper minutes on dead subs.
 *   - Sort: hot / active-now first (actor param `sort: 'hot'`). Falls back
 *     to relevance only if the caller overrides.
 *   - Time window: derived from the topic search's own time horizon. For
 *     3-month / 6-month spans (which the actor doesn't support natively),
 *     we request `year` and filter client-side by `createdAt`.
 *   - No min-score / min-comment thresholds.
 *
 * Actor docs: https://apify.com/trudax/reddit-scraper-lite
 */

import {
  startApifyActorRun,
  waitForApifyRunSuccess,
  fetchApifyDatasetItems,
} from '@/lib/tiktok/apify-run';
import { recordApifyRun } from '@/lib/apify/record-run';
import type { RedditComment, RedditPost, RedditSearchResult } from '@/lib/reddit/client';

const DEFAULT_ACTOR = 'trudax/reddit-scraper-lite';

function getActorId(): string {
  return (process.env.APIFY_REDDIT_ACTOR_ID ?? DEFAULT_ACTOR).trim();
}

/**
 * Default sort is `relevance` — Reddit's own `hot` on keyword search ranks by
 * *global* hotness, which surfaces unrelated viral posts that fragment-match
 * the query. `relevance` ranks by keyword match quality within the time
 * window, which is what a topic search actually wants. Override with
 * `APIFY_REDDIT_SORT=hot` if a specific search needs activity ranking.
 */
function getSort(): 'hot' | 'new' | 'top' | 'rising' | 'relevance' {
  const raw = (process.env.APIFY_REDDIT_SORT ?? 'relevance').toLowerCase();
  const allowed = ['hot', 'new', 'top', 'rising', 'relevance'] as const;
  return (allowed as readonly string[]).includes(raw)
    ? (raw as 'hot' | 'new' | 'top' | 'rising' | 'relevance')
    : 'relevance';
}

/**
 * Map Cortex's time_range to the trudax actor's `time` filter.
 * When the search window has no native actor equivalent (3mo, 6mo), we ask
 * for `year` and filter client-side by createdAt to match the real cutoff.
 */
export function mapTimeRangeForActor(timeRange: string): {
  actorTime: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  /** Millisecond cutoff: posts older than this are dropped after fetch. Null = keep everything the actor returned. */
  cutoffMs: number | null;
} {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  switch (timeRange) {
    case 'last_7_days':    return { actorTime: 'week',  cutoffMs: now - 7 * day };
    case 'last_30_days':   return { actorTime: 'month', cutoffMs: now - 30 * day };
    case 'last_3_months':  return { actorTime: 'year',  cutoffMs: now - 90 * day };
    case 'last_6_months':  return { actorTime: 'year',  cutoffMs: now - 180 * day };
    case 'last_year':      return { actorTime: 'year',  cutoffMs: now - 365 * day };
    default:               return { actorTime: 'month', cutoffMs: null };
  }
}

/**
 * Hard cap on a single Reddit run. trudax pricing is ~$0.004/item, so 200 items
 * per run keeps each run <$0.80 even on deep. Fix for the 2026-04-23 incident
 * where volume=deep with 50 comments blew up a single run to ~1,268 items /
 * $4.86 because the item-budget formula (posts × (1 + comments)) inflated
 * way past what the admin configured.
 */
const HARD_MAX_POSTS_PER_RUN = 200;
const HARD_MAX_COMMENTS_PER_POST = 10;

/**
 * Resolve the target post count. The admin-configured `scraper_settings` row
 * is the single source of truth (see lib/search/scraper-settings.ts). 0 is
 * a valid explicit choice meaning "skip Reddit entirely" — it must NOT
 * fall through to any preset. When no override is provided at all, we use
 * the SCRAPER_DEFAULTS fallback (the `getScraperSettings()` caller already
 * applies the default before we see the value, so hitting this branch
 * means the caller intentionally skipped settings). Always clamped to
 * HARD_MAX_POSTS_PER_RUN.
 */
function targetPosts(override?: number): number {
  const chosen =
    typeof override === 'number' && !Number.isNaN(override) ? Math.max(0, override) : 80;
  return Math.min(chosen, HARD_MAX_POSTS_PER_RUN);
}

/** Max comments per post. Same rules as targetPosts + hard cap. */
function commentsPerPost(override?: number): number {
  const chosen =
    typeof override === 'number' && !Number.isNaN(override) ? Math.max(0, override) : 5;
  return Math.min(chosen, HARD_MAX_COMMENTS_PER_POST);
}

function parseIsoToUnix(s: unknown): number {
  if (typeof s !== 'string' || !s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

function stripRedditIdPrefix(id: unknown): string {
  return typeof id === 'string' ? id.replace(/^t[13]_/, '') : '';
}

function stripSubPrefix(community: unknown): string {
  return typeof community === 'string' ? community.replace(/^r\//i, '').trim() : '';
}

/**
 * Parse the flat dataset returned by trudax-lite into grouped posts with
 * their top_comments. The actor emits posts and comments as separate rows,
 * each with a `dataType` discriminator and a shared `postId` linking a
 * comment to its parent post.
 */
function parseTrudaxDataset(
  items: unknown[],
  maxCommentsPerPost: number,
): (RedditPost & { top_comments: RedditComment[] })[] {
  const postsById = new Map<string, RedditPost & { top_comments: RedditComment[] }>();
  const commentsByPost = new Map<string, RedditComment[]>();

  for (const raw of items) {
    const row = raw as Record<string, unknown>;
    const dataType = String(row.dataType ?? '').toLowerCase();

    // Heuristic: if dataType absent, infer from fields (post has title, comment doesn't).
    const looksLikePost = dataType === 'post' || (!dataType && typeof row.title === 'string' && row.title.length > 0);

    // Linking key: always a bare post id (no "t3_" prefix). Posts expose this
    // as `parsedId`; comments expose their *parent* as `postId` with a prefix.
    const postId = looksLikePost
      ? (String(row.parsedId ?? '') || stripRedditIdPrefix(row.id))
      : stripRedditIdPrefix(row.postId ?? row.parentId ?? '');
    if (!postId) continue;

    if (looksLikePost) {
      const communityName = stripSubPrefix(row.parsedCommunityName ?? row.communityName);
      const url = String(row.url ?? '');
      let permalink = '';
      try {
        permalink = url ? new URL(url).pathname : `/r/${communityName}/comments/${postId}/`;
      } catch {
        permalink = `/r/${communityName}/comments/${postId}/`;
      }

      postsById.set(postId, {
        id: postId,
        title: String(row.title ?? ''),
        selftext: String(row.body ?? row.selftext ?? '').slice(0, 4000),
        score: Number(row.upVotes ?? row.score ?? 0),
        num_comments: Number(row.numberOfComments ?? row.num_comments ?? 0),
        url,
        permalink,
        subreddit: communityName,
        created_utc: parseIsoToUnix(row.createdAt),
        author: String(row.username ?? row.author ?? '[deleted]'),
        link_flair_text: (row.flair as string) ?? null,
        top_comments: [],
      });
    } else {
      // Comment row.
      const body = String(row.body ?? row.text ?? '').slice(0, 1000);
      if (!body || body === '[deleted]' || body === '[removed]') continue;

      const comment: RedditComment = {
        id: stripRedditIdPrefix(row.id) || String(row.parsedId ?? ''),
        body,
        score: Number(row.upVotes ?? row.score ?? 0),
        author: String(row.username ?? row.author ?? '[deleted]'),
        created_utc: parseIsoToUnix(row.createdAt),
      };

      if (!commentsByPost.has(postId)) commentsByPost.set(postId, []);
      commentsByPost.get(postId)!.push(comment);
    }
  }

  // Attach top N comments by score to each post.
  const out: (RedditPost & { top_comments: RedditComment[] })[] = [];
  for (const [id, post] of postsById) {
    const comments = (commentsByPost.get(id) ?? [])
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCommentsPerPost);
    out.push({ ...post, top_comments: comments });
  }
  return out;
}

export async function gatherRedditViaTrudaxApify(
  query: string,
  timeRange: string,
  apiKey: string,
  runContext: { topicSearchId?: string | null; clientId?: string | null } = {},
  overrides: { postsOverride?: number; commentsPerPostOverride?: number } = {},
): Promise<(RedditSearchResult & { postsWithComments: (RedditPost & { top_comments: RedditComment[] })[] }) | null> {
  const actorId = getActorId();
  const sort = getSort();
  const { actorTime, cutoffMs } = mapTimeRangeForActor(timeRange);
  const maxItems = targetPosts(overrides.postsOverride);
  const maxComments = commentsPerPost(overrides.commentsPerPostOverride);

  // maxItems caps the *total* dataset rows (posts + comments). Budget for
  // every post bringing back up to maxComments rows. Capped HARD at
  // maxItems × 4 (so 150 posts + 8 comments budgets to 600 rows, not 1350).
  // The actor stops early anyway when it exhausts the search space;
  // over-budgeting just lets it pull more noise without more signal.
  const itemBudget = Math.min(800, maxItems * 4);

  const input: Record<string, unknown> = {
    searches: [query],
    type: 'posts',
    sort,
    time: actorTime,
    maxItems: itemBudget,
    maxPostCount: maxItems,
    maxComments,
    maxCommunitiesCount: 0,
    maxUserCount: 0,
    searchPosts: true,
    searchComments: false,
    searchCommunities: false,
    searchUsers: false,
    includeNSFW: false,
    proxy: { useApifyProxy: true },
    scrollTimeout: 40,
    skipComments: false,
  };

  const runId = await startApifyActorRun(actorId, input, apiKey);
  if (!runId) {
    await recordApifyRun({
      runId: '',
      actorId,
      apiKey,
      context: { purpose: 'reddit', ...runContext },
      startFailure: { error: `Actor ${actorId} failed to start` },
    });
    return null;
  }

  // Wait budget scales with the admin-configured target — bigger runs need
  // more Apify time, but the HARD_MAX_POSTS_PER_RUN cap bounds this.
  const maxWaitMs = maxItems > 120 ? 300_000 : 180_000;
  const ok = await waitForApifyRunSuccess(runId, apiKey, maxWaitMs, 3000);

  // Record cost regardless of success/fail — we're billed for compute either way.
  await recordApifyRun({
    runId,
    actorId,
    apiKey,
    context: { purpose: 'reddit', ...runContext },
  });

  if (!ok) return null;

  const fetchLimit = Math.min(5000, Math.max(500, itemBudget * 2));
  const items = await fetchApifyDatasetItems(runId, apiKey, fetchLimit);

  let posts = parseTrudaxDataset(items, maxComments);

  // Client-side cutoff — actor's `time=year` is the closest ceiling for 3mo/6mo spans.
  if (cutoffMs != null) {
    const cutoffSec = Math.floor(cutoffMs / 1000);
    posts = posts.filter((p) => p.created_utc === 0 || p.created_utc >= cutoffSec);
  }

  if (posts.length === 0) return null;

  // Sort by hot-ish composite (upvotes + 2×comments) so the summary card
  // and AI prompt see the most active threads first.
  posts.sort((a, b) => b.score + b.num_comments * 2 - (a.score + a.num_comments * 2));
  posts = posts.slice(0, maxItems);

  const subCounts: Record<string, number> = {};
  for (const p of posts) {
    if (p.subreddit) subCounts[p.subreddit] = (subCounts[p.subreddit] ?? 0) + 1;
  }
  const topSubreddits = Object.entries(subCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);

  const bare: RedditPost[] = posts.map(({ top_comments: _c, ...rest }) => rest);

  return {
    posts: bare,
    topSubreddits,
    totalPosts: posts.length,
    postsWithComments: posts,
  };
}
