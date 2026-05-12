import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STALE_PENDING_GRACE_MINUTES,
  isPastPendingGrace,
  reconcileParentStatusFromSpp,
} from './zernio-reconcile';

/**
 * Pins the grace-window rollup so the IG/FB/LI-published + YT-stuck-pending
 * scenario (expired YouTube token) flips the parent into `partially_failed`
 * within the daily reconciler instead of sitting in `scheduled` forever.
 */

describe('isPastPendingGrace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns false when scheduled_at is null', () => {
    expect(isPastPendingGrace(null)).toBe(false);
  });

  it('returns false when scheduled_at is in the future', () => {
    expect(isPastPendingGrace('2026-05-12T14:00:00.000Z')).toBe(false);
  });

  it('returns false when within the grace window', () => {
    // 30 minutes ago, grace is 60min.
    expect(isPastPendingGrace('2026-05-12T11:30:00.000Z')).toBe(false);
  });

  it('returns true past the grace window', () => {
    // 2 hours ago.
    expect(isPastPendingGrace('2026-05-12T10:00:00.000Z')).toBe(true);
  });

  it('returns false at exactly the grace boundary', () => {
    const exact = new Date(Date.now() - STALE_PENDING_GRACE_MINUTES * 60 * 1000).toISOString();
    expect(isPastPendingGrace(exact)).toBe(false);
  });

  it('returns false for an unparseable timestamp', () => {
    expect(isPastPendingGrace('not-a-date')).toBe(false);
  });
});

interface ParentRow {
  id: string;
  status: string;
  scheduled_at: string | null;
}

function mockAdminClient(parent: ParentRow | null, sppStatuses: string[]) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      if (table === 'scheduled_posts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: parent }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);
            return { eq: async () => ({ data: null }) };
          },
        };
      }
      if (table === 'scheduled_post_platforms') {
        return {
          select: () => ({
            eq: async () => ({ data: sppStatuses.map((s) => ({ status: s })) }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { client, updates };
}

describe('reconcileParentStatusFromSpp — grace window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('leaves parent alone when pending leg is inside grace window', async () => {
    const { client, updates } = mockAdminClient(
      { id: 'p1', status: 'scheduled', scheduled_at: '2026-05-12T11:30:00.000Z' },
      ['published', 'published', 'pending'],
    );
    await reconcileParentStatusFromSpp(client as never, 'late_1');
    expect(updates).toEqual([]);
  });

  it('flips parent to partially_failed when pending leg is past grace and others published', async () => {
    const { client, updates } = mockAdminClient(
      { id: 'p1', status: 'scheduled', scheduled_at: '2026-05-12T10:00:00.000Z' },
      ['published', 'published', 'pending'],
    );
    await reconcileParentStatusFromSpp(client as never, 'late_1');
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('partially_failed');
    expect(typeof updates[0].failure_reason).toBe('string');
  });

  it('flips parent to failed when all legs are pending past grace', async () => {
    const { client, updates } = mockAdminClient(
      { id: 'p1', status: 'scheduled', scheduled_at: '2026-05-12T10:00:00.000Z' },
      ['pending', 'pending'],
    );
    await reconcileParentStatusFromSpp(client as never, 'late_1');
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('failed');
  });

  it('does not downgrade a published parent', async () => {
    const { client, updates } = mockAdminClient(
      { id: 'p1', status: 'published', scheduled_at: '2026-05-12T10:00:00.000Z' },
      ['published', 'published', 'pending'],
    );
    await reconcileParentStatusFromSpp(client as never, 'late_1');
    expect(updates).toEqual([]);
  });

  it('mixed failed + published still rolls up to partially_failed without grace logic', async () => {
    const { client, updates } = mockAdminClient(
      { id: 'p1', status: 'scheduled', scheduled_at: '2026-05-12T11:30:00.000Z' },
      ['published', 'failed'],
    );
    await reconcileParentStatusFromSpp(client as never, 'late_1');
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('partially_failed');
  });

  it('all published rolls up to published and clears failure_reason', async () => {
    const { client, updates } = mockAdminClient(
      { id: 'p1', status: 'scheduled', scheduled_at: '2026-05-12T11:30:00.000Z' },
      ['published', 'published'],
    );
    await reconcileParentStatusFromSpp(client as never, 'late_1');
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('published');
    expect(updates[0].failure_reason).toBeNull();
    expect(updates[0].published_at).toBeTruthy();
  });
});
