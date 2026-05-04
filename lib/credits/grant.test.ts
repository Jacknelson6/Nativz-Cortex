import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expireCredit, grantCredit } from './grant';

function makeSupabase(
  result: { data: unknown; error: { message: string } | null },
): { supabase: SupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => result);
  return { supabase: { rpc } as unknown as SupabaseClient, rpc };
}

describe('grantCredit', () => {
  it('passes every arg through to the grant_credit RPC', async () => {
    const { supabase, rpc } = makeSupabase({
      data: { granted: true, tx_id: 'tx-1', new_balance: 60 },
      error: null,
    });

    await grantCredit(supabase, {
      clientId: 'client-1',
      kind: 'grant_topup',
      delta: 60,
      idempotencyKey: 'pi_abc',
      note: 'Stripe top-up',
      actorUserId: 'user-7',
      stripePaymentIntent: 'pi_abc',
      deliverableTypeSlug: 'static_graphic',
    });

    expect(rpc).toHaveBeenCalledWith('grant_credit', {
      p_client_id: 'client-1',
      p_kind: 'grant_topup',
      p_delta: 60,
      p_idempotency_key: 'pi_abc',
      p_note: 'Stripe top-up',
      p_actor_user_id: 'user-7',
      p_stripe_payment_intent: 'pi_abc',
      p_deliverable_type_slug: 'static_graphic',
    });
  });

  it("defaults deliverableTypeSlug to 'edited_video' when omitted", async () => {
    const { supabase, rpc } = makeSupabase({
      data: { granted: true, tx_id: 't', new_balance: 5 },
      error: null,
    });

    await grantCredit(supabase, { clientId: 'c', kind: 'adjust', delta: 1 });

    const call = rpc.mock.calls[0]![1] as { p_deliverable_type_slug: string };
    expect(call.p_deliverable_type_slug).toBe('edited_video');
  });

  it('coerces optional fields to null when omitted', async () => {
    const { supabase, rpc } = makeSupabase({
      data: { granted: true, tx_id: 't', new_balance: 1 },
      error: null,
    });

    await grantCredit(supabase, { clientId: 'c', kind: 'adjust', delta: 1 });

    const call = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(call.p_idempotency_key).toBeNull();
    expect(call.p_note).toBeNull();
    expect(call.p_actor_user_id).toBeNull();
    expect(call.p_stripe_payment_intent).toBeNull();
  });

  it('returns the GrantResult on a fresh grant', async () => {
    const { supabase } = makeSupabase({
      data: { granted: true, tx_id: 'tx-x', new_balance: 5 },
      error: null,
    });

    const result = await grantCredit(supabase, {
      clientId: 'c',
      kind: 'grant_topup',
      delta: 5,
    });
    expect(result).toEqual({ granted: true, tx_id: 'tx-x', new_balance: 5 });
  });

  it('returns the GrantResult on idempotent replay (already_granted)', async () => {
    const { supabase } = makeSupabase({
      data: { already_granted: true },
      error: null,
    });

    const result = await grantCredit(supabase, {
      clientId: 'c',
      kind: 'grant_topup',
      delta: 5,
      idempotencyKey: 'pi_dupe',
    });
    expect(result).toEqual({ already_granted: true });
  });

  it('throws a descriptive Error when the RPC errors', async () => {
    const { supabase } = makeSupabase({
      data: null,
      error: { message: 'check constraint violation' },
    });

    await expect(
      grantCredit(supabase, { clientId: 'c', kind: 'adjust', delta: 1 }),
    ).rejects.toThrow(/grant_credit failed: check constraint violation/);
  });
});

describe('expireCredit', () => {
  it('passes args through to the expire_credit RPC', async () => {
    const { supabase, rpc } = makeSupabase({
      data: { expired: true, tx_id: 'tx-1', new_balance: 0 },
      error: null,
    });

    await expireCredit(supabase, {
      clientId: 'c1',
      delta: -3,
      idempotencyKey: 'cb_xyz',
      note: 'Stripe dispute claw-back',
      deliverableTypeSlug: 'ugc_video',
    });

    expect(rpc).toHaveBeenCalledWith('expire_credit', {
      p_client_id: 'c1',
      p_delta: -3,
      p_idempotency_key: 'cb_xyz',
      p_note: 'Stripe dispute claw-back',
      p_deliverable_type_slug: 'ugc_video',
    });
  });

  it("defaults deliverableTypeSlug to 'edited_video' when omitted", async () => {
    const { supabase, rpc } = makeSupabase({
      data: { expired: true, tx_id: 't', new_balance: 0 },
      error: null,
    });

    await expireCredit(supabase, {
      clientId: 'c1',
      delta: -1,
      idempotencyKey: 'k',
      note: 'n',
    });

    const call = rpc.mock.calls[0]![1] as { p_deliverable_type_slug: string };
    expect(call.p_deliverable_type_slug).toBe('edited_video');
  });

  it('throws synchronously when delta is zero or positive (refuses to grant via expire)', async () => {
    const { supabase, rpc } = makeSupabase({ data: null, error: null });

    await expect(
      expireCredit(supabase, { clientId: 'c', delta: 0, idempotencyKey: 'k', note: 'n' }),
    ).rejects.toThrow(/expireCredit delta must be negative \(got 0\)/);

    await expect(
      expireCredit(supabase, { clientId: 'c', delta: 5, idempotencyKey: 'k', note: 'n' }),
    ).rejects.toThrow(/expireCredit delta must be negative \(got 5\)/);

    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns the ExpireResult on a fresh expire', async () => {
    const { supabase } = makeSupabase({
      data: { expired: true, tx_id: 't', new_balance: 4 },
      error: null,
    });

    const result = await expireCredit(supabase, {
      clientId: 'c',
      delta: -1,
      idempotencyKey: 'k',
      note: 'n',
    });
    expect(result).toEqual({ expired: true, tx_id: 't', new_balance: 4 });
  });

  it('returns the ExpireResult on idempotent replay (already_expired)', async () => {
    const { supabase } = makeSupabase({
      data: { already_expired: true },
      error: null,
    });

    const result = await expireCredit(supabase, {
      clientId: 'c',
      delta: -1,
      idempotencyKey: 'dupe',
      note: 'n',
    });
    expect(result).toEqual({ already_expired: true });
  });

  it('throws a descriptive Error when the RPC returns an error', async () => {
    const { supabase } = makeSupabase({
      data: null,
      error: { message: 'ledger row missing' },
    });

    await expect(
      expireCredit(supabase, {
        clientId: 'c',
        delta: -1,
        idempotencyKey: 'k',
        note: 'n',
      }),
    ).rejects.toThrow(/expire_credit failed: ledger row missing/);
  });
});
