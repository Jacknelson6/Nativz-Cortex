import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDeliverablePipeline } from './get-pipeline';

/**
 * Pipeline loader contract under test.
 *
 *   1. Bucket priority is delivered > approved > in_review > in_edit > unstarted.
 *      A drop_video that is BOTH published and consumed lands in delivered;
 *      a published row never appears under approved.
 *   2. in_review requires both `revised_video_url` AND at least one
 *      non-approved review comment in the last REVIEW_WINDOW_DAYS (7) days.
 *      Non-approved comments older than 7 days fall back to in_edit.
 *   3. in_edit = revised upload landed, no recent non-approved comments.
 *   4. unstarted = no revised_video_url at all.
 *   5. Title falls back to drive_file_name minus extension.
 *   6. Caption preview truncates to 77 chars + "..." for inputs over 80.
 *   7. updatedAt prefers revised_video_uploaded_at; falls back to created_at.
 *   8. Cards are sorted by updatedAt desc.
 *   9. Empty drops or empty videos short-circuit to a zeroed snapshot.
 */

interface DropRow {
  id: string;
}

interface DropVideoRow {
  id: string;
  drop_id: string;
  scheduled_post_id: string | null;
  drive_file_name: string | null;
  draft_caption: string | null;
  thumbnail_url: string | null;
  revised_video_url: string | null;
  revised_video_uploaded_at: string | null;
  revised_video_uploaded_by: string | null;
  created_at: string;
}

interface ShareLinkRow {
  id: string;
  drop_id: string;
  post_review_link_map: Record<string, string> | null;
}

interface PostRow {
  id: string;
  status: string | null;
  title: string | null;
}

interface CommentRow {
  review_link_id: string;
  status: string;
  created_at: string;
}

interface ConsumeRow {
  charge_unit_id: string;
}

interface MockState {
  drops: DropRow[];
  videos: DropVideoRow[];
  shareLinks: ShareLinkRow[];
  posts: PostRow[];
  comments: CommentRow[];
  consumes: ConsumeRow[];
}

function makeAdmin(state: MockState): SupabaseClient {
  const fromMock = vi.fn((table: string) => {
    if (table === 'content_drops') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: state.drops, error: null })),
      };
      return builder;
    }
    if (table === 'content_drop_videos') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => builder),
        order: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: state.videos, error: null })),
      };
      return builder;
    }
    if (table === 'content_drop_share_links') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: state.shareLinks, error: null })),
      };
      return builder;
    }
    if (table === 'scheduled_posts') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: state.posts, error: null })),
      };
      return builder;
    }
    if (table === 'post_review_comments') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: state.comments, error: null })),
      };
      return builder;
    }
    if (table === 'credit_transactions') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: state.consumes, error: null })),
      };
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from: fromMock } as unknown as SupabaseClient;
}

function video(overrides: Partial<DropVideoRow>): DropVideoRow {
  return {
    id: overrides.id ?? 'v-1',
    drop_id: overrides.drop_id ?? 'drop-1',
    scheduled_post_id: overrides.scheduled_post_id ?? null,
    drive_file_name: overrides.drive_file_name ?? null,
    draft_caption: overrides.draft_caption ?? null,
    thumbnail_url: overrides.thumbnail_url ?? null,
    revised_video_url: overrides.revised_video_url ?? null,
    revised_video_uploaded_at: overrides.revised_video_uploaded_at ?? null,
    revised_video_uploaded_by: overrides.revised_video_uploaded_by ?? null,
    created_at: overrides.created_at ?? '2026-04-01T00:00:00Z',
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // Anchor "now" so the 7-day review window is deterministic.
  vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getDeliverablePipeline', () => {
  it('returns a zeroed snapshot when the client has no drops', async () => {
    const admin = makeAdmin({
      drops: [],
      videos: [],
      shareLinks: [],
      posts: [],
      comments: [],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards).toEqual([]);
    expect(snap.counts).toEqual({
      unstarted: 0,
      in_edit: 0,
      in_review: 0,
      approved: 0,
      delivered: 0,
    });
  });

  it('returns a zeroed snapshot when drops exist but contain no videos', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [],
      shareLinks: [],
      posts: [],
      comments: [],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards).toEqual([]);
    expect(snap.counts.unstarted).toBe(0);
  });

  it('buckets a video with no revised_video_url as unstarted', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [video({ id: 'v-raw' })],
      shareLinks: [],
      posts: [],
      comments: [],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards[0]?.bucket).toBe('unstarted');
    expect(snap.counts.unstarted).toBe(1);
  });

  it('buckets a video with revised upload but no recent comments as in_edit', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [
        video({
          id: 'v-edited',
          revised_video_url: 'https://cdn.example.com/v-edited.mp4',
          revised_video_uploaded_at: '2026-04-29T10:00:00Z',
        }),
      ],
      shareLinks: [],
      posts: [],
      comments: [],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards[0]?.bucket).toBe('in_edit');
    expect(snap.counts.in_edit).toBe(1);
  });

  it('promotes a video to in_review when a recent (within 7 days) non-approved comment exists', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [
        video({
          id: 'v-review',
          scheduled_post_id: 'post-1',
          revised_video_url: 'https://cdn.example.com/v.mp4',
          revised_video_uploaded_at: '2026-04-28T10:00:00Z',
        }),
      ],
      shareLinks: [
        {
          id: 'sl-1',
          drop_id: 'drop-1',
          post_review_link_map: { 'post-1': 'review-1' },
        },
      ],
      posts: [{ id: 'post-1', status: 'scheduled', title: 'Title 1' }],
      comments: [
        {
          review_link_id: 'review-1',
          status: 'pending',
          created_at: '2026-04-29T10:00:00Z', // 1 day ago, well within window
        },
      ],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards[0]?.bucket).toBe('in_review');
  });

  it('keeps a video in in_edit when the only non-approved comment is older than the 7-day window', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [
        video({
          id: 'v-stale',
          scheduled_post_id: 'post-1',
          revised_video_url: 'https://cdn.example.com/v.mp4',
          revised_video_uploaded_at: '2026-04-01T10:00:00Z',
        }),
      ],
      shareLinks: [
        {
          id: 'sl-1',
          drop_id: 'drop-1',
          post_review_link_map: { 'post-1': 'review-1' },
        },
      ],
      posts: [{ id: 'post-1', status: 'scheduled', title: 'Title' }],
      comments: [
        {
          review_link_id: 'review-1',
          // 14 days before the anchored "now" of 2026-04-30T12:00:00Z
          status: 'pending',
          created_at: '2026-04-16T11:00:00Z',
        },
      ],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards[0]?.bucket).toBe('in_edit');
  });

  it('keeps a video in in_edit when only approved comments exist (approved comments do not trigger in_review)', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [
        video({
          id: 'v-approved-only',
          scheduled_post_id: 'post-1',
          revised_video_url: 'https://cdn.example.com/v.mp4',
          revised_video_uploaded_at: '2026-04-29T10:00:00Z',
        }),
      ],
      shareLinks: [
        {
          id: 'sl-1',
          drop_id: 'drop-1',
          post_review_link_map: { 'post-1': 'review-1' },
        },
      ],
      posts: [{ id: 'post-1', status: 'scheduled', title: 'Title' }],
      comments: [
        {
          review_link_id: 'review-1',
          status: 'approved',
          created_at: '2026-04-30T08:00:00Z',
        },
      ],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards[0]?.bucket).toBe('in_edit');
  });

  it('buckets as approved when a consume row exists for the drop_video', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [
        video({
          id: 'v-consumed',
          scheduled_post_id: 'post-1',
          revised_video_url: 'https://cdn.example.com/v.mp4',
        }),
      ],
      shareLinks: [],
      posts: [{ id: 'post-1', status: 'scheduled', title: 'Title' }],
      comments: [],
      consumes: [{ charge_unit_id: 'v-consumed' }],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards[0]?.bucket).toBe('approved');
  });

  it('promotes approved+published to delivered (delivered wins over approved)', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [
        video({
          id: 'v-shipped',
          scheduled_post_id: 'post-1',
          revised_video_url: 'https://cdn.example.com/v.mp4',
        }),
      ],
      shareLinks: [],
      posts: [{ id: 'post-1', status: 'published', title: 'Shipped' }],
      comments: [],
      consumes: [{ charge_unit_id: 'v-shipped' }],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards[0]?.bucket).toBe('delivered');
    expect(snap.counts.approved).toBe(0);
    expect(snap.counts.delivered).toBe(1);
  });

  it('falls back to drive_file_name (stripped of extension) when there is no scheduled_post title', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [
        video({
          id: 'v-1',
          drive_file_name: 'launch-day-final-v3.mp4',
        }),
      ],
      shareLinks: [],
      posts: [],
      comments: [],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards[0]?.title).toBe('launch-day-final-v3');
  });

  it('truncates draft_caption to 77 chars + "..." when over 80 chars', async () => {
    // Build a caption that is exactly 100 chars to provoke truncation.
    const longCaption = 'a'.repeat(100);
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [video({ id: 'v-1', draft_caption: longCaption })],
      shareLinks: [],
      posts: [],
      comments: [],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards[0]?.captionPreview).toBe(`${'a'.repeat(77)}...`);
    expect(snap.cards[0]?.captionPreview?.length).toBe(80);
  });

  it('returns the trimmed caption verbatim when at or under 80 chars', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [video({ id: 'v-1', draft_caption: '  hello world  ' })],
      shareLinks: [],
      posts: [],
      comments: [],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards[0]?.captionPreview).toBe('hello world');
  });

  it('uses revised_video_uploaded_at for updatedAt when present, else created_at', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [
        video({
          id: 'v-revised',
          created_at: '2026-04-01T00:00:00Z',
          revised_video_url: 'https://cdn.example.com/r.mp4',
          revised_video_uploaded_at: '2026-04-20T00:00:00Z',
        }),
        video({
          id: 'v-raw',
          created_at: '2026-04-25T00:00:00Z',
        }),
      ],
      shareLinks: [],
      posts: [],
      comments: [],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    const revised = snap.cards.find((c) => c.id === 'v-revised');
    const raw = snap.cards.find((c) => c.id === 'v-raw');
    expect(revised?.updatedAt).toBe('2026-04-20T00:00:00Z');
    expect(raw?.updatedAt).toBe('2026-04-25T00:00:00Z');
  });

  it('sorts cards by updatedAt descending', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [
        video({ id: 'v-old', created_at: '2026-04-01T00:00:00Z' }),
        video({ id: 'v-new', created_at: '2026-04-29T00:00:00Z' }),
        video({ id: 'v-mid', created_at: '2026-04-15T00:00:00Z' }),
      ],
      shareLinks: [],
      posts: [],
      comments: [],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    expect(snap.cards.map((c) => c.id)).toEqual(['v-new', 'v-mid', 'v-old']);
  });

  it('returns counts that sum to the total number of cards', async () => {
    const admin = makeAdmin({
      drops: [{ id: 'drop-1' }],
      videos: [
        video({ id: 'v-raw' }),
        video({
          id: 'v-edited',
          revised_video_url: 'https://cdn.example.com/v.mp4',
        }),
        video({
          id: 'v-shipped',
          scheduled_post_id: 'post-1',
          revised_video_url: 'https://cdn.example.com/v.mp4',
        }),
      ],
      shareLinks: [],
      posts: [{ id: 'post-1', status: 'published', title: 'Out' }],
      comments: [],
      consumes: [],
    });
    const snap = await getDeliverablePipeline(admin, 'c1');
    const total =
      snap.counts.unstarted +
      snap.counts.in_edit +
      snap.counts.in_review +
      snap.counts.approved +
      snap.counts.delivered;
    expect(total).toBe(snap.cards.length);
    expect(snap.counts.unstarted).toBe(1);
    expect(snap.counts.in_edit).toBe(1);
    expect(snap.counts.delivered).toBe(1);
  });
});
