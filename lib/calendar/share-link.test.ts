import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/posting', () => ({
  getPostingService: vi.fn(),
}));

import { mintOrRefreshShareLink } from './share-link';
import { getPostingService } from '@/lib/posting';

const mockGetPostingService = vi.mocked(getPostingService);

interface MockState {
  existingLink: {
    id: string;
    token: string;
    included_post_ids: string[] | null;
  } | null;
  /** rows returned by `.from('scheduled_posts').select().in('id', ids)` */
  scheduledPosts: Array<{
    id: string;
    status: string;
    late_post_id: string | null;
  }>;
  /** Throw on update of content_drop_share_links */
  updateError: { message: string } | null;
  /** Throw on insert of content_drop_share_links */
  insertError: { message: string } | null;
  /** Throw inside service.deletePost */
  deletePostThrows: boolean;
  trace: {
    insertedShareLink: Record<string, unknown> | null;
    updatedShareLink: Record<string, unknown> | null;
    deletedZernioPosts: string[];
    revertedScheduledPosts: string[];
  };
}

function makeSupabase(state: MockState): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'content_drop_share_links') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({
                  data: state.existingLink,
                  error: null,
                }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              select: () => ({
                single: async () => {
                  if (state.updateError) {
                    return { data: null, error: state.updateError };
                  }
                  state.trace.updatedShareLink = patch;
                  return {
                    data: {
                      id: state.existingLink!.id,
                      token: state.existingLink!.token,
                      expires_at: '2026-06-02T00:00:00.000Z',
                    },
                    error: null,
                  };
                },
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                if (state.insertError) {
                  return { data: null, error: state.insertError };
                }
                state.trace.insertedShareLink = payload;
                return {
                  data: {
                    id: 'sl-new',
                    token: 'tok-new',
                    expires_at: '2026-06-02T00:00:00.000Z',
                  },
                  error: null,
                };
              },
            }),
          }),
        };
      }
      if (table === 'scheduled_posts') {
        return {
          select: () => ({
            in: async () => ({
              data: state.scheduledPosts,
              error: null,
            }),
          }),
          update: () => ({
            eq: async (_col: string, val: string) => {
              state.trace.revertedScheduledPosts.push(val);
              return { data: null, error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

function makeState(over: Partial<MockState> = {}): MockState {
  return {
    existingLink: null,
    scheduledPosts: [],
    updateError: null,
    insertError: null,
    deletePostThrows: false,
    trace: {
      insertedShareLink: null,
      updatedShareLink: null,
      deletedZernioPosts: [],
      revertedScheduledPosts: [],
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPostingService.mockReturnValue({
    deletePost: vi.fn(),
  } as unknown as ReturnType<typeof getPostingService>);
});

describe('mintOrRefreshShareLink', () => {
  describe('first share (no existing link)', () => {
    it('inserts a fresh row with refreshed=false and empty orphan arrays', async () => {
      const state = makeState();
      const supabase = makeSupabase(state);

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'drop-1',
        clientId: 'client-1',
        postIds: ['p1', 'p2'],
        reviewMap: { p1: 'rl-1', p2: 'rl-2' },
      });

      expect(result.refreshed).toBe(false);
      expect(result.cancelledOrphans).toEqual([]);
      expect(result.unpublishableOrphans).toEqual([]);
      expect(result.id).toBe('sl-new');
      expect(result.token).toBe('tok-new');
      expect(state.trace.insertedShareLink).toMatchObject({
        drop_id: 'drop-1',
        client_id: 'client-1',
        included_post_ids: ['p1', 'p2'],
        post_review_link_map: { p1: 'rl-1', p2: 'rl-2' },
      });
    });

    it('throws with the insert error message when insert fails', async () => {
      const state = makeState({ insertError: { message: 'unique violation' } });
      const supabase = makeSupabase(state);

      await expect(
        mintOrRefreshShareLink(supabase, {
          dropId: 'd',
          clientId: 'c',
          postIds: [],
          reviewMap: {},
        }),
      ).rejects.toThrow(/unique violation/);
    });
  });

  describe('refresh (existing link)', () => {
    it('updates the row, resets cycle counters, returns refreshed=true', async () => {
      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok-keep',
          included_post_ids: ['p1', 'p2'],
        },
      });
      const supabase = makeSupabase(state);

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'drop-2',
        clientId: 'client-1',
        postIds: ['p1', 'p2', 'p3'],
        reviewMap: { p1: 'rl-1', p2: 'rl-2', p3: 'rl-3' },
      });

      expect(result.refreshed).toBe(true);
      expect(result.id).toBe('sl-1');
      expect(result.token).toBe('tok-keep');
      expect(state.trace.updatedShareLink).toMatchObject({
        drop_id: 'drop-2',
        included_post_ids: ['p1', 'p2', 'p3'],
        post_review_link_map: { p1: 'rl-1', p2: 'rl-2', p3: 'rl-3' },
        last_viewed_at: null,
        last_followup_at: null,
        followup_count: 0,
        abandoned_at: null,
      });
    });

    it('returns no orphans when refresh keeps every post', async () => {
      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok',
          included_post_ids: ['p1', 'p2'],
        },
      });
      const supabase = makeSupabase(state);

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'd',
        clientId: 'c',
        postIds: ['p1', 'p2'],
        reviewMap: {},
      });

      expect(result.cancelledOrphans).toEqual([]);
      expect(result.unpublishableOrphans).toEqual([]);
      expect(mockGetPostingService).not.toHaveBeenCalled();
    });

    it('throws with the update error message when update fails', async () => {
      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok',
          included_post_ids: [],
        },
        updateError: { message: 'rls denied' },
      });
      const supabase = makeSupabase(state);

      await expect(
        mintOrRefreshShareLink(supabase, {
          dropId: 'd',
          clientId: 'c',
          postIds: [],
          reviewMap: {},
        }),
      ).rejects.toThrow(/rls denied/);
    });

    it('handles existing link with null included_post_ids (treats as empty)', async () => {
      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok',
          included_post_ids: null,
        },
      });
      const supabase = makeSupabase(state);

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'd',
        clientId: 'c',
        postIds: ['p1'],
        reviewMap: {},
      });

      expect(result.cancelledOrphans).toEqual([]);
      expect(result.unpublishableOrphans).toEqual([]);
      expect(mockGetPostingService).not.toHaveBeenCalled();
    });
  });

  describe('orphan cancellation', () => {
    it('DELETEs scheduled orphans in Zernio and reverts them to draft', async () => {
      const deletePost = vi.fn(async () => undefined);
      mockGetPostingService.mockReturnValue({
        deletePost,
      } as unknown as ReturnType<typeof getPostingService>);

      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok',
          included_post_ids: ['p1', 'p-orphan'],
        },
        scheduledPosts: [
          { id: 'p-orphan', status: 'scheduled', late_post_id: 'late-99' },
        ],
      });
      const supabase = makeSupabase(state);

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'd',
        clientId: 'c',
        postIds: ['p1'],
        reviewMap: {},
      });

      expect(deletePost).toHaveBeenCalledWith('late-99');
      expect(result.cancelledOrphans).toEqual(['p-orphan']);
      expect(result.unpublishableOrphans).toEqual([]);
      expect(state.trace.revertedScheduledPosts).toContain('p-orphan');
    });

    it('reports published orphans as unpublishable, no Zernio DELETE', async () => {
      const deletePost = vi.fn();
      mockGetPostingService.mockReturnValue({
        deletePost,
      } as unknown as ReturnType<typeof getPostingService>);

      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok',
          included_post_ids: ['p-pub'],
        },
        scheduledPosts: [
          { id: 'p-pub', status: 'published', late_post_id: 'late-1' },
        ],
      });
      const supabase = makeSupabase(state);

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'd',
        clientId: 'c',
        postIds: [],
        reviewMap: {},
      });

      expect(deletePost).not.toHaveBeenCalled();
      expect(result.cancelledOrphans).toEqual([]);
      expect(result.unpublishableOrphans).toEqual(['p-pub']);
    });

    it('treats partially_failed orphans as unpublishable', async () => {
      const deletePost = vi.fn();
      mockGetPostingService.mockReturnValue({
        deletePost,
      } as unknown as ReturnType<typeof getPostingService>);

      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok',
          included_post_ids: ['p-pf'],
        },
        scheduledPosts: [
          { id: 'p-pf', status: 'partially_failed', late_post_id: 'late-pf' },
        ],
      });
      const supabase = makeSupabase(state);

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'd',
        clientId: 'c',
        postIds: [],
        reviewMap: {},
      });

      expect(deletePost).not.toHaveBeenCalled();
      expect(result.unpublishableOrphans).toEqual(['p-pf']);
    });

    it('skips published orphans that have no late_post_id (never reached Zernio)', async () => {
      const deletePost = vi.fn();
      mockGetPostingService.mockReturnValue({
        deletePost,
      } as unknown as ReturnType<typeof getPostingService>);

      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok',
          included_post_ids: ['p-orphan'],
        },
        scheduledPosts: [
          { id: 'p-orphan', status: 'published', late_post_id: null },
        ],
      });
      const supabase = makeSupabase(state);

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'd',
        clientId: 'c',
        postIds: [],
        reviewMap: {},
      });

      expect(result.cancelledOrphans).toEqual([]);
      expect(result.unpublishableOrphans).toEqual([]);
    });

    it('skips draft orphans entirely (no Zernio DELETE, no DB revert)', async () => {
      const deletePost = vi.fn();
      mockGetPostingService.mockReturnValue({
        deletePost,
      } as unknown as ReturnType<typeof getPostingService>);

      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok',
          included_post_ids: ['p-draft'],
        },
        scheduledPosts: [
          { id: 'p-draft', status: 'draft', late_post_id: null },
        ],
      });
      const supabase = makeSupabase(state);

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'd',
        clientId: 'c',
        postIds: [],
        reviewMap: {},
      });

      expect(deletePost).not.toHaveBeenCalled();
      expect(result.cancelledOrphans).toEqual([]);
      expect(state.trace.revertedScheduledPosts).toEqual([]);
    });

    it('skips orphans missing late_post_id even if status is scheduled', async () => {
      const deletePost = vi.fn();
      mockGetPostingService.mockReturnValue({
        deletePost,
      } as unknown as ReturnType<typeof getPostingService>);

      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok',
          included_post_ids: ['p-orphan'],
        },
        scheduledPosts: [
          { id: 'p-orphan', status: 'scheduled', late_post_id: null },
        ],
      });
      const supabase = makeSupabase(state);

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'd',
        clientId: 'c',
        postIds: [],
        reviewMap: {},
      });

      expect(deletePost).not.toHaveBeenCalled();
      expect(result.cancelledOrphans).toEqual([]);
    });

    it('still reverts DB to draft when Zernio DELETE throws (logs but proceeds)', async () => {
      const deletePost = vi.fn(async () => {
        throw new Error('zernio 502');
      });
      mockGetPostingService.mockReturnValue({
        deletePost,
      } as unknown as ReturnType<typeof getPostingService>);

      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok',
          included_post_ids: ['p-orphan'],
        },
        scheduledPosts: [
          { id: 'p-orphan', status: 'scheduled', late_post_id: 'late-x' },
        ],
      });
      const supabase = makeSupabase(state);
      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'd',
        clientId: 'c',
        postIds: [],
        reviewMap: {},
      });

      expect(deletePost).toHaveBeenCalledWith('late-x');
      expect(state.trace.revertedScheduledPosts).toContain('p-orphan');
      expect(result.cancelledOrphans).toEqual(['p-orphan']);
      expect(consoleErr).toHaveBeenCalled();
      consoleErr.mockRestore();
    });

    it('handles a mix of scheduled, published, and draft orphans correctly', async () => {
      const deletePost = vi.fn(async () => undefined);
      mockGetPostingService.mockReturnValue({
        deletePost,
      } as unknown as ReturnType<typeof getPostingService>);

      const state = makeState({
        existingLink: {
          id: 'sl-1',
          token: 'tok',
          included_post_ids: ['keep', 'sched', 'pub', 'drft'],
        },
        scheduledPosts: [
          { id: 'sched', status: 'scheduled', late_post_id: 'late-s' },
          { id: 'pub', status: 'published', late_post_id: 'late-p' },
          { id: 'drft', status: 'draft', late_post_id: null },
        ],
      });
      const supabase = makeSupabase(state);

      const result = await mintOrRefreshShareLink(supabase, {
        dropId: 'd',
        clientId: 'c',
        postIds: ['keep'],
        reviewMap: {},
      });

      expect(deletePost).toHaveBeenCalledTimes(1);
      expect(deletePost).toHaveBeenCalledWith('late-s');
      expect(result.cancelledOrphans).toEqual(['sched']);
      expect(result.unpublishableOrphans).toEqual(['pub']);
    });
  });
});
