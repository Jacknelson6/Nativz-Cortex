import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { consumeCredit } from './consume';

function makeSupabase(
  result: { data: unknown; error: { message: string } | null },
): { supabase: SupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => result);
  const supabase = { rpc } as unknown as SupabaseClient;
  return { supabase, rpc };
}

describe('consumeCredit', () => {
  it('passes every arg through to the consume_credit RPC', async () => {
    const { supabase, rpc } = makeSupabase({
      data: { consumed: true, tx_id: 'tx-1', new_balance: 59 },
      error: null,
    });

    await consumeCredit(supabase, {
      clientId: 'client-1',
      chargeUnitKind: 'drop_video',
      chargeUnitId: 'dv-1',
      scheduledPostId: 'sp-1',
      shareLinkId: 'sl-1',
      reviewerEmail: 'jane@acme.com',
      deliverableTypeSlug: 'static_graphic',
      editorUserId: 'user-9',
      revisionCount: 2,
      deliverableId: 'dv-1',
    });

    expect(rpc).toHaveBeenCalledWith('consume_credit', {
      p_client_id: 'client-1',
      p_charge_unit_kind: 'drop_video',
      p_charge_unit_id: 'dv-1',
      p_scheduled_post_id: 'sp-1',
      p_share_link_id: 'sl-1',
      p_reviewer_email: 'jane@acme.com',
      p_deliverable_type_slug: 'static_graphic',
      p_editor_user_id: 'user-9',
      p_revision_count: 2,
      p_deliverable_id: 'dv-1',
    });
  });

  it("defaults deliverableTypeSlug to 'edited_video' when omitted (Phase A back-compat)", async () => {
    const { supabase, rpc } = makeSupabase({
      data: { consumed: true, tx_id: 'tx-2', new_balance: 5 },
      error: null,
    });

    await consumeCredit(supabase, {
      clientId: 'c1',
      chargeUnitKind: 'drop_video',
      chargeUnitId: 'dv-2',
    });

    const call = rpc.mock.calls[0]![1] as { p_deliverable_type_slug: string };
    expect(call.p_deliverable_type_slug).toBe('edited_video');
  });

  it('defaults revisionCount to 0 when omitted', async () => {
    const { supabase, rpc } = makeSupabase({
      data: { consumed: true, tx_id: 't', new_balance: 1 },
      error: null,
    });

    await consumeCredit(supabase, {
      clientId: 'c1',
      chargeUnitKind: 'drop_video',
      chargeUnitId: 'dv',
    });

    const call = rpc.mock.calls[0]![1] as { p_revision_count: number };
    expect(call.p_revision_count).toBe(0);
  });

  it('coerces optional reference fields (scheduledPostId, shareLinkId, reviewerEmail, editorUserId, deliverableId) to null when omitted', async () => {
    const { supabase, rpc } = makeSupabase({
      data: { consumed: true, tx_id: 't', new_balance: 1 },
      error: null,
    });

    await consumeCredit(supabase, {
      clientId: 'c1',
      chargeUnitKind: 'scheduled_post',
      chargeUnitId: 'sp',
    });

    const call = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(call.p_scheduled_post_id).toBeNull();
    expect(call.p_share_link_id).toBeNull();
    expect(call.p_reviewer_email).toBeNull();
    expect(call.p_editor_user_id).toBeNull();
    expect(call.p_deliverable_id).toBeNull();
  });

  it('returns the ConsumeResult on a fresh consume', async () => {
    const { supabase } = makeSupabase({
      data: { consumed: true, tx_id: 'tx-9', new_balance: 12 },
      error: null,
    });

    const result = await consumeCredit(supabase, {
      clientId: 'c1',
      chargeUnitKind: 'drop_video',
      chargeUnitId: 'dv',
    });

    expect(result).toEqual({ consumed: true, tx_id: 'tx-9', new_balance: 12 });
  });

  it('returns the ConsumeResult on idempotent replay (already_consumed)', async () => {
    const { supabase } = makeSupabase({
      data: { already_consumed: true, consume_id: 'tx-prev' },
      error: null,
    });

    const result = await consumeCredit(supabase, {
      clientId: 'c1',
      chargeUnitKind: 'drop_video',
      chargeUnitId: 'dv',
    });

    expect(result).toEqual({ already_consumed: true, consume_id: 'tx-prev' });
  });

  it('throws a descriptive Error when the RPC returns an error', async () => {
    const { supabase } = makeSupabase({
      data: null,
      error: { message: 'insufficient credits' },
    });

    await expect(
      consumeCredit(supabase, {
        clientId: 'c1',
        chargeUnitKind: 'drop_video',
        chargeUnitId: 'dv',
      }),
    ).rejects.toThrow(/consume_credit failed: insufficient credits/);
  });
});
