import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * `publishScheduledPost` is the only function allowed to flip a draft
 * scheduled_posts row to 'scheduled' and hand it to Zernio. Three
 * incident-driven contracts to pin:
 *
 *   1. Idempotent early return. If the post is already not a draft, OR
 *      already has late_post_id set, the function returns
 *      `{ alreadyPublished: true }` WITHOUT touching the posting
 *      service. Zernio publish is non-idempotent — calling
 *      service.publishPost twice would create two live posts. (The
 *      cron approved-draft sweep + share-link approval handler can
 *      both fire for the same post.)
 *
 *   2. Atomic claim. Before calling Zernio, the function tries to flip
 *      'draft' → 'publishing' atomically (matching status='draft' and
 *      late_post_id IS NULL in the WHERE clause). If zero rows return,
 *      another worker won the race and we MUST short-circuit. The
 *      May-1 incident root cause was missing this CAS — both callers
 *      passed the read-then-check guard, both called publishPost, and
 *      the second writer stamped its late_post_id over the first.
 *
 *   3. Per-platform backfill. After publishPost succeeds, every entry
 *      in publish.platforms[] gets matched (by late_account_id) back to
 *      a scheduled_post_platforms row, and that row's status is updated
 *      to 'published' or 'failed'. The "16 stuck rows after May 1"
 *      bug was this loop missing — rows stayed at status='pending'
 *      indefinitely while Zernio had already posted them.
 *
 * Mocks: createBranchedClient builds a SupabaseClient stub that
 * branches by table name. Each table returns its own chain stub with
 * canned data. The posting service is mocked at the @/lib/posting
 * boundary.
 */

const publishMock = vi.fn();

vi.mock('@/lib/posting', () => ({
  getPostingService: () => ({ publishPost: publishMock }),
}));

import { publishScheduledPost } from './schedule-drop';

interface PostRow {
  id: string;
  client_id: string;
  caption: string;
  hashtags: string[] | null;
  scheduled_at: string;
  status: string;
  late_post_id: string | null;
  cover_image_url: string | null;
  youtube_title: string | null;
  youtube_description: string | null;
  youtube_tags: string[] | null;
  youtube_privacy: 'public' | 'unlisted' | 'private' | null;
  youtube_made_for_kids: boolean | null;
  tiktok_allow_comment: boolean | null;
  tiktok_allow_duet: boolean | null;
  tiktok_allow_stitch: boolean | null;
  instagram_share_to_feed: boolean | null;
}

interface SppRow {
  id: string;
  social_profile_id: string;
  social_profiles: {
    platform: string;
    late_account_id: string;
  };
}

function basePost(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: 'post-1',
    client_id: 'client-1',
    caption: 'hello world',
    hashtags: ['tag'],
    scheduled_at: '2026-06-01T12:00:00Z',
    status: 'draft',
    late_post_id: null,
    cover_image_url: 'https://cdn.example/c.jpg',
    youtube_title: null,
    youtube_description: null,
    youtube_tags: null,
    youtube_privacy: null,
    youtube_made_for_kids: null,
    tiktok_allow_comment: null,
    tiktok_allow_duet: null,
    tiktok_allow_stitch: null,
    instagram_share_to_feed: null,
    ...overrides,
  };
}

function createBranchedClient(opts: {
  post?: PostRow | null;
  postNotFoundError?: { message: string } | null;
  // The first .update() against scheduled_posts is the atomic CAS claim.
  // claimWins=true means the CAS returns the row; claimWins=false means
  // another worker beat us and the .maybeSingle() resolves with null.
  claimWins?: boolean;
  // When the claim loses, this is what the refresh-read returns.
  refreshLatePostId?: string | null;
  mediaLateUrl?: string | null;
  spps?: SppRow[];
  videoCaptionVariants?: Record<string, string> | null;
}) {
  const post = opts.post === undefined ? basePost() : opts.post;
  const claimWins = opts.claimWins ?? true;
  const updateCalls: Array<{ table: string; payload: unknown; where: Record<string, unknown> }> = [];

  const client: SupabaseClient = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: ((table: string) => {
      if (table === 'scheduled_posts') {
        let isUpdateSelectChain = false;
        let updatePayload: unknown = null;
        const whereClause: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {
          select: () => chain,
          update: (payload: unknown) => {
            isUpdateSelectChain = true;
            updatePayload = payload;
            return chain;
          },
          eq: (col: string, val: unknown) => {
            whereClause[col] = val;
            return chain;
          },
          is: (col: string, val: unknown) => {
            whereClause[col] = val;
            return chain;
          },
          single: () =>
            Promise.resolve({
              data: post,
              error: opts.postNotFoundError ?? null,
            }),
          maybeSingle: () => {
            if (isUpdateSelectChain) {
              updateCalls.push({ table, payload: updatePayload, where: { ...whereClause } });
              return Promise.resolve({
                data: claimWins ? { id: post?.id ?? 'post-1' } : null,
              });
            }
            return Promise.resolve({
              data: { late_post_id: opts.refreshLatePostId ?? null },
            });
          },
          then: (resolve: (value: { data: null; error: null }) => unknown) => {
            if (isUpdateSelectChain) {
              updateCalls.push({ table, payload: updatePayload, where: { ...whereClause } });
            }
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };
        return chain;
      }
      if (table === 'scheduled_post_media') {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          single: () =>
            Promise.resolve({
              data: {
                media_id: 'm1',
                scheduler_media: { late_media_url: opts.mediaLateUrl ?? null },
              },
            }),
        };
        return chain;
      }
      if (table === 'scheduled_post_platforms') {
        let updatePayload: unknown = null;
        const whereClause: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {
          select: () => chain,
          update: (payload: unknown) => {
            updatePayload = payload;
            return chain;
          },
          eq: (col: string, val: unknown) => {
            whereClause[col] = val;
            // When the .update().eq() chain awaits, push the call. We
            // detect the awaited form via the `then` below.
            return chain;
          },
          then: (resolve: (value: { data: null; error: null }) => unknown) => {
            updateCalls.push({ table, payload: updatePayload, where: { ...whereClause } });
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };
        // The select chain (no update) needs to resolve to the spp rows.
        // We override .eq to return a thenable that resolves with data.
        chain.eq = (col: string, val: unknown) => {
          whereClause[col] = val;
          if (updatePayload !== null) {
            return chain;
          }
          // SELECT path — eq is awaited directly.
          return {
            then: (resolve: (value: { data: SppRow[] }) => unknown) =>
              Promise.resolve({ data: opts.spps ?? [] }).then(resolve),
          };
        };
        return chain;
      }
      if (table === 'content_drop_videos') {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () =>
            Promise.resolve({
              data: { caption_variants: opts.videoCaptionVariants ?? null },
            }),
        };
        return chain;
      }
      throw new Error(`unexpected table: ${table}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  } as unknown as SupabaseClient;

  return { client, updateCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
  publishMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('publishScheduledPost — idempotency early return', () => {
  it('throws when the post row is missing entirely', async () => {
    const { client } = createBranchedClient({ post: null });
    await expect(publishScheduledPost(client, 'missing')).rejects.toThrow(/not found/);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('returns alreadyPublished:true when status is not draft', async () => {
    const { client } = createBranchedClient({
      post: basePost({ status: 'scheduled', late_post_id: 'late-existing' }),
    });
    const result = await publishScheduledPost(client, 'post-1');
    expect(result).toEqual({ alreadyPublished: true, externalPostId: 'late-existing' });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('returns alreadyPublished:true when late_post_id is set even if status is still draft', async () => {
    // Pin: belt-and-braces. A row stuck mid-flight (status=draft but
    // late_post_id stamped from a prior attempt) MUST NOT call Zernio
    // again — that would create a duplicate live post.
    const { client } = createBranchedClient({
      post: basePost({ status: 'draft', late_post_id: 'late-orphan' }),
    });
    const result = await publishScheduledPost(client, 'post-1');
    expect(result.alreadyPublished).toBe(true);
    expect(result.externalPostId).toBe('late-orphan');
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('returns externalPostId:undefined (not the string "null") when row has neither status nor late_post_id flag', async () => {
    // Defensive: late_post_id ?? undefined coercion. A regression
    // returning literal null would break TypeScript callers expecting
    // string | undefined.
    const { client } = createBranchedClient({
      post: basePost({ status: 'scheduled', late_post_id: null }),
    });
    const result = await publishScheduledPost(client, 'post-1');
    expect(result).toEqual({ alreadyPublished: true, externalPostId: undefined });
  });
});

describe('publishScheduledPost — atomic claim (race protection)', () => {
  it('issues an UPDATE that filters on status=draft AND late_post_id IS NULL', async () => {
    // Pin: the CAS must include both predicates. Dropping either lets
    // a concurrent worker's already-publishing row pass through.
    publishMock.mockResolvedValue({
      externalPostId: 'late-1',
      platforms: [],
    });
    const { client, updateCalls } = createBranchedClient({
      claimWins: true,
      mediaLateUrl: 'https://media.example/v.mp4',
      spps: [
        {
          id: 'spp-1',
          social_profile_id: 'sp-1',
          social_profiles: { platform: 'instagram', late_account_id: 'late-acct-1' },
        },
      ],
    });
    await publishScheduledPost(client, 'post-1');
    const claim = updateCalls.find(
      (c) =>
        c.table === 'scheduled_posts' &&
        (c.payload as { status?: string }).status === 'publishing',
    );
    expect(claim, 'expected a CAS to publishing status').toBeDefined();
    expect(claim!.where.id).toBe('post-1');
    expect(claim!.where.status).toBe('draft');
    expect(claim!.where.late_post_id).toBe(null);
  });

  it('short-circuits when the claim loses (zero rows returned from CAS)', async () => {
    // Pin: the May-1 incident scenario. Two workers race; the loser
    // sees null from .maybeSingle() and returns alreadyPublished
    // without ever calling publishPost.
    const { client } = createBranchedClient({
      claimWins: false,
      refreshLatePostId: 'late-winner',
    });
    const result = await publishScheduledPost(client, 'post-1');
    expect(result.alreadyPublished).toBe(true);
    expect(result.externalPostId).toBe('late-winner');
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('reports externalPostId:undefined on lost-claim when winner has not yet stamped late_post_id', async () => {
    // Real race window: claim already advanced post to status=publishing
    // but Zernio call is still in flight. Refresh read returns
    // late_post_id=null. Caller sees alreadyPublished but no id.
    const { client } = createBranchedClient({
      claimWins: false,
      refreshLatePostId: null,
    });
    const result = await publishScheduledPost(client, 'post-1');
    expect(result).toEqual({ alreadyPublished: true, externalPostId: undefined });
  });
});

describe('publishScheduledPost — preconditions on the publish path', () => {
  it('throws when the linked media row has no late_media_url', async () => {
    // Pin: cannot publish without a video. A regression that passed
    // null videoUrl through to Zernio would explode there with a
    // confusing error, so we fail fast.
    const { client } = createBranchedClient({
      claimWins: true,
      mediaLateUrl: null,
      spps: [
        {
          id: 'spp-1',
          social_profile_id: 'sp-1',
          social_profiles: { platform: 'instagram', late_account_id: 'late-1' },
        },
      ],
    });
    await expect(publishScheduledPost(client, 'post-1')).rejects.toThrow(/media URL/);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('throws when no spp rows have a late_account_id (no platforms)', async () => {
    const { client } = createBranchedClient({
      claimWins: true,
      mediaLateUrl: 'https://media.example/v.mp4',
      spps: [],
    });
    await expect(publishScheduledPost(client, 'post-1')).rejects.toThrow(/no platforms/);
    expect(publishMock).not.toHaveBeenCalled();
  });
});

describe('publishScheduledPost — happy path', () => {
  it('hands off to the posting service with caption, hashtags, scheduled_at', async () => {
    publishMock.mockResolvedValue({
      externalPostId: 'late-1',
      platforms: [],
    });
    const { client } = createBranchedClient({
      claimWins: true,
      mediaLateUrl: 'https://media.example/v.mp4',
      spps: [
        {
          id: 'spp-1',
          social_profile_id: 'sp-1',
          social_profiles: { platform: 'instagram', late_account_id: 'late-acct-1' },
        },
      ],
    });
    await publishScheduledPost(client, 'post-1');
    expect(publishMock).toHaveBeenCalledTimes(1);
    const call = publishMock.mock.calls[0][0];
    expect(call.videoUrl).toBe('https://media.example/v.mp4');
    expect(call.caption).toBe('hello world');
    expect(call.hashtags).toEqual(['tag']);
    expect(call.scheduledAt).toBe('2026-06-01T12:00:00Z');
    expect(call.platformProfileIds).toEqual(['late-acct-1']);
  });

  it('returns alreadyPublished:false with externalPostId on success', async () => {
    publishMock.mockResolvedValue({
      externalPostId: 'late-success-id',
      platforms: [],
    });
    const { client } = createBranchedClient({
      claimWins: true,
      mediaLateUrl: 'https://media.example/v.mp4',
      spps: [
        {
          id: 'spp-1',
          social_profile_id: 'sp-1',
          social_profiles: { platform: 'instagram', late_account_id: 'late-acct-1' },
        },
      ],
    });
    const result = await publishScheduledPost(client, 'post-1');
    expect(result).toEqual({ alreadyPublished: false, externalPostId: 'late-success-id' });
  });

  it('flips the post to status=scheduled and stamps late_post_id', async () => {
    publishMock.mockResolvedValue({
      externalPostId: 'late-success-id',
      platforms: [],
    });
    const { client, updateCalls } = createBranchedClient({
      claimWins: true,
      mediaLateUrl: 'https://media.example/v.mp4',
      spps: [
        {
          id: 'spp-1',
          social_profile_id: 'sp-1',
          social_profiles: { platform: 'instagram', late_account_id: 'late-acct-1' },
        },
      ],
    });
    await publishScheduledPost(client, 'post-1');
    const final = updateCalls.find(
      (c) =>
        c.table === 'scheduled_posts' &&
        (c.payload as { status?: string }).status === 'scheduled',
    );
    expect(final, 'expected final flip to scheduled').toBeDefined();
    expect((final!.payload as { late_post_id?: string }).late_post_id).toBe('late-success-id');
  });
});

describe('publishScheduledPost — per-platform backfill', () => {
  it('updates the matching scheduled_post_platforms row with published status + external url', async () => {
    // Pin: the "16 stuck rows" regression. Without this loop, spp.status
    // stays at 'pending' even though Zernio has already gone live.
    publishMock.mockResolvedValue({
      externalPostId: 'late-1',
      platforms: [
        {
          profileId: 'late-acct-1',
          status: 'published',
          externalPostId: 'ig-post-77',
          externalPostUrl: 'https://instagram.com/p/77',
        },
      ],
    });
    const { client, updateCalls } = createBranchedClient({
      claimWins: true,
      mediaLateUrl: 'https://media.example/v.mp4',
      spps: [
        {
          id: 'spp-1',
          social_profile_id: 'sp-1',
          social_profiles: { platform: 'instagram', late_account_id: 'late-acct-1' },
        },
      ],
    });
    await publishScheduledPost(client, 'post-1');
    const sppUpdate = updateCalls.find(
      (c) => c.table === 'scheduled_post_platforms' && c.where.id === 'spp-1',
    );
    expect(sppUpdate, 'expected spp row update').toBeDefined();
    const payload = sppUpdate!.payload as Record<string, unknown>;
    expect(payload.status).toBe('published');
    expect(payload.external_post_id).toBe('ig-post-77');
    expect(payload.external_post_url).toBe('https://instagram.com/p/77');
    expect(payload.failure_reason).toBe(null);
  });

  it('marks failed platforms with status=failed and the error reason', async () => {
    publishMock.mockResolvedValue({
      externalPostId: 'late-1',
      platforms: [
        {
          profileId: 'late-acct-1',
          status: 'failed',
          error: 'Zernio rejected: rate limited',
        },
      ],
    });
    const { client, updateCalls } = createBranchedClient({
      claimWins: true,
      mediaLateUrl: 'https://media.example/v.mp4',
      spps: [
        {
          id: 'spp-1',
          social_profile_id: 'sp-1',
          social_profiles: { platform: 'instagram', late_account_id: 'late-acct-1' },
        },
      ],
    });
    await publishScheduledPost(client, 'post-1');
    const sppUpdate = updateCalls.find(
      (c) => c.table === 'scheduled_post_platforms' && c.where.id === 'spp-1',
    );
    expect(sppUpdate).toBeDefined();
    const payload = sppUpdate!.payload as Record<string, unknown>;
    expect(payload.status).toBe('failed');
    expect(payload.failure_reason).toBe('Zernio rejected: rate limited');
  });

  it('skips platforms whose profileId is not present in lateIdToSppId', async () => {
    // Defensive: Zernio echo includes a profileId we did not send. A
    // regression that crashed on missing-key lookup would fail the
    // whole publish even though the Zernio side succeeded.
    publishMock.mockResolvedValue({
      externalPostId: 'late-1',
      platforms: [
        {
          profileId: 'mystery-not-mapped',
          status: 'published',
          externalPostId: 'm-1',
          externalPostUrl: 'https://x',
        },
        {
          profileId: 'late-acct-1',
          status: 'published',
          externalPostId: 'real-1',
          externalPostUrl: 'https://real',
        },
      ],
    });
    const { client, updateCalls } = createBranchedClient({
      claimWins: true,
      mediaLateUrl: 'https://media.example/v.mp4',
      spps: [
        {
          id: 'spp-1',
          social_profile_id: 'sp-1',
          social_profiles: { platform: 'instagram', late_account_id: 'late-acct-1' },
        },
      ],
    });
    await publishScheduledPost(client, 'post-1');
    const sppUpdates = updateCalls.filter((c) => c.table === 'scheduled_post_platforms');
    expect(sppUpdates).toHaveLength(1);
    expect(sppUpdates[0].where.id).toBe('spp-1');
  });
});
