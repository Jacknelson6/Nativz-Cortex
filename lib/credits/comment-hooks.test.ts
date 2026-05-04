import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('./resolve-charge-unit', () => ({
  resolveChargeUnit: vi.fn(),
}));
vi.mock('./consume', () => ({
  consumeCredit: vi.fn(),
}));
vi.mock('./refund', () => ({
  refundCredit: vi.fn(),
}));
vi.mock('./email', () => ({
  maybeSendBalanceWarning: vi.fn(),
}));
vi.mock('@/lib/deliverables/types-cache', () => ({
  getDeliverableTypeId: vi.fn(async () => 'dt-edited-video'),
}));

import {
  consumeForApproval,
  hasPriorApproval,
  refundForUnapproval,
} from './comment-hooks';
import { resolveChargeUnit } from './resolve-charge-unit';
import { consumeCredit } from './consume';
import { refundCredit } from './refund';
import { maybeSendBalanceWarning } from './email';
import { getDeliverableTypeId } from '@/lib/deliverables/types-cache';

const mockResolveChargeUnit = vi.mocked(resolveChargeUnit);
const mockConsumeCredit = vi.mocked(consumeCredit);
const mockRefundCredit = vi.mocked(refundCredit);
const mockMaybeSendBalanceWarning = vi.mocked(maybeSendBalanceWarning);
const mockGetDeliverableTypeId = vi.mocked(getDeliverableTypeId);

beforeEach(() => {
  vi.clearAllMocks();
});

interface SupabaseMock {
  scheduledPostsRow?: { client_id: string | null } | null;
  revisionCount?: number;
  priorApprovalCount?: number;
}

function makeSupabase(opts: SupabaseMock = {}): SupabaseClient {
  const supabase = {
    from(table: string) {
      if (table === 'scheduled_posts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.scheduledPostsRow ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'post_review_comments') {
        return {
          select: () => ({
            eq: () => ({
              eq: (col: string, val: string) => {
                const count =
                  val === 'approved'
                    ? opts.priorApprovalCount ?? 0
                    : opts.revisionCount ?? 0;
                return Promise.resolve({ count, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
  return supabase;
}

describe('hasPriorApproval', () => {
  it('returns true when at least one approved comment exists', async () => {
    const supabase = makeSupabase({ priorApprovalCount: 3 });
    expect(await hasPriorApproval(supabase, 'rl-1')).toBe(true);
  });

  it('returns false when no approved comments exist', async () => {
    const supabase = makeSupabase({ priorApprovalCount: 0 });
    expect(await hasPriorApproval(supabase, 'rl-1')).toBe(false);
  });

  it('treats null count as zero (defensive)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ count: null, error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    expect(await hasPriorApproval(supabase, 'rl-1')).toBe(false);
  });
});

describe('refundForUnapproval', () => {
  it('skips when resolveChargeUnit returns null', async () => {
    mockResolveChargeUnit.mockResolvedValueOnce(null);
    const supabase = makeSupabase();
    await refundForUnapproval(supabase, {
      scheduledPostId: 'sp-x',
      reason: 'approval deleted',
    });
    expect(mockRefundCredit).not.toHaveBeenCalled();
  });

  it('calls refundCredit with charge details + reason', async () => {
    mockResolveChargeUnit.mockResolvedValueOnce({
      kind: 'drop_video',
      id: 'dv-1',
      deliverableTypeSlug: 'edited_video',
      editorUserId: 'user-1',
      deliverableId: 'dv-1',
    });
    mockRefundCredit.mockResolvedValueOnce({
      refunded: true,
      tx_id: 't',
      new_balance: 6,
    });
    const supabase = makeSupabase();
    await refundForUnapproval(supabase, {
      scheduledPostId: 'sp-1',
      reason: 'changes_requested after approval',
    });
    expect(mockRefundCredit).toHaveBeenCalledWith(supabase, {
      chargeUnitKind: 'drop_video',
      chargeUnitId: 'dv-1',
      note: 'changes_requested after approval',
    });
  });

  it('swallows errors thrown by refundCredit (never rethrows)', async () => {
    mockResolveChargeUnit.mockResolvedValueOnce({
      kind: 'drop_video',
      id: 'dv-1',
      deliverableTypeSlug: 'edited_video',
      editorUserId: null,
      deliverableId: 'dv-1',
    });
    mockRefundCredit.mockRejectedValueOnce(new Error('rpc blew up'));
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = makeSupabase();
    await expect(
      refundForUnapproval(supabase, {
        scheduledPostId: 'sp-err',
        reason: 'r',
      }),
    ).resolves.toBeUndefined();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });
});

describe('consumeForApproval', () => {
  const baseArgs = {
    scheduledPostId: 'sp-1',
    shareLinkId: 'sl-1',
    reviewerName: 'Jane',
  };

  it('skips when resolveChargeUnit returns null', async () => {
    mockResolveChargeUnit.mockResolvedValueOnce(null);
    const supabase = makeSupabase();
    await consumeForApproval(supabase, baseArgs);
    expect(mockConsumeCredit).not.toHaveBeenCalled();
  });

  it('skips when scheduled_posts row has no client_id', async () => {
    mockResolveChargeUnit.mockResolvedValueOnce({
      kind: 'drop_video',
      id: 'dv-1',
      deliverableTypeSlug: 'edited_video',
      editorUserId: null,
      deliverableId: 'dv-1',
    });
    const supabase = makeSupabase({ scheduledPostsRow: { client_id: null } });
    await consumeForApproval(supabase, baseArgs);
    expect(mockConsumeCredit).not.toHaveBeenCalled();
  });

  it('calls consumeCredit with full args, including charge unit + revision count', async () => {
    mockResolveChargeUnit.mockResolvedValueOnce({
      kind: 'drop_video',
      id: 'dv-1',
      deliverableTypeSlug: 'static_graphic',
      editorUserId: 'editor-1',
      deliverableId: 'dv-1',
    });
    mockConsumeCredit.mockResolvedValueOnce({
      consumed: true,
      tx_id: 'tx-1',
      new_balance: 5,
    });
    const supabase = makeSupabase({
      scheduledPostsRow: { client_id: 'client-1' },
      revisionCount: 2,
    });
    await consumeForApproval(supabase, {
      ...baseArgs,
      reviewerEmail: 'jane@acme.com',
      reviewLinkId: 'rl-1',
    });
    expect(mockConsumeCredit).toHaveBeenCalledWith(supabase, {
      clientId: 'client-1',
      chargeUnitKind: 'drop_video',
      chargeUnitId: 'dv-1',
      scheduledPostId: 'sp-1',
      shareLinkId: 'sl-1',
      reviewerEmail: 'jane@acme.com',
      deliverableTypeSlug: 'static_graphic',
      editorUserId: 'editor-1',
      deliverableId: 'dv-1',
      revisionCount: 2,
    });
  });

  it('falls back to reviewerName when reviewerEmail is omitted', async () => {
    mockResolveChargeUnit.mockResolvedValueOnce({
      kind: 'scheduled_post',
      id: 'sp-1',
      deliverableTypeSlug: 'edited_video',
      editorUserId: null,
      deliverableId: null,
    });
    mockConsumeCredit.mockResolvedValueOnce({
      consumed: true,
      tx_id: 'tx',
      new_balance: 3,
    });
    const supabase = makeSupabase({
      scheduledPostsRow: { client_id: 'c1' },
    });
    await consumeForApproval(supabase, baseArgs);
    const call = mockConsumeCredit.mock.calls[0]![1] as {
      reviewerEmail: string;
    };
    expect(call.reviewerEmail).toBe('Jane');
  });

  it('defaults revisionCount to 0 when reviewLinkId is omitted', async () => {
    mockResolveChargeUnit.mockResolvedValueOnce({
      kind: 'drop_video',
      id: 'dv-1',
      deliverableTypeSlug: 'edited_video',
      editorUserId: null,
      deliverableId: 'dv-1',
    });
    mockConsumeCredit.mockResolvedValueOnce({
      consumed: true,
      tx_id: 'tx',
      new_balance: 5,
    });
    const supabase = makeSupabase({
      scheduledPostsRow: { client_id: 'c1' },
    });
    await consumeForApproval(supabase, baseArgs);
    const call = mockConsumeCredit.mock.calls[0]![1] as {
      revisionCount: number;
    };
    expect(call.revisionCount).toBe(0);
  });

  it('returns early on already_consumed without firing balance warning', async () => {
    mockResolveChargeUnit.mockResolvedValueOnce({
      kind: 'drop_video',
      id: 'dv-1',
      deliverableTypeSlug: 'edited_video',
      editorUserId: null,
      deliverableId: 'dv-1',
    });
    mockConsumeCredit.mockResolvedValueOnce({
      already_consumed: true,
      consume_id: 'tx-prev',
    });
    const supabase = makeSupabase({
      scheduledPostsRow: { client_id: 'c1' },
    });
    await consumeForApproval(supabase, baseArgs);
    expect(mockMaybeSendBalanceWarning).not.toHaveBeenCalled();
    expect(mockGetDeliverableTypeId).not.toHaveBeenCalled();
  });

  it('fires balance warning with reconstructed previousBalance on a fresh consume', async () => {
    mockResolveChargeUnit.mockResolvedValueOnce({
      kind: 'drop_video',
      id: 'dv-1',
      deliverableTypeSlug: 'edited_video',
      editorUserId: null,
      deliverableId: 'dv-1',
    });
    mockConsumeCredit.mockResolvedValueOnce({
      consumed: true,
      tx_id: 'tx-1',
      new_balance: 0,
    });
    const supabase = makeSupabase({
      scheduledPostsRow: { client_id: 'c1' },
    });
    await consumeForApproval(supabase, baseArgs);
    expect(mockGetDeliverableTypeId).toHaveBeenCalledWith(
      supabase,
      'edited_video',
    );
    expect(mockMaybeSendBalanceWarning).toHaveBeenCalledWith(supabase, {
      clientId: 'c1',
      previousBalance: 1,
      newBalance: 0,
      deliverableTypeId: 'dt-edited-video',
    });
  });

  it('swallows errors thrown by consumeCredit (never rethrows)', async () => {
    mockResolveChargeUnit.mockResolvedValueOnce({
      kind: 'drop_video',
      id: 'dv-1',
      deliverableTypeSlug: 'edited_video',
      editorUserId: null,
      deliverableId: 'dv-1',
    });
    mockConsumeCredit.mockRejectedValueOnce(new Error('rpc went sideways'));
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = makeSupabase({
      scheduledPostsRow: { client_id: 'c1' },
    });
    await expect(
      consumeForApproval(supabase, baseArgs),
    ).resolves.toBeUndefined();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });
});
