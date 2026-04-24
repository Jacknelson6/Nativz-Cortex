import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * logUsage tests — focused on the reverse-race branch introduced with the
 * UNIQUE partial index from migration 161. Happy-path behaviour is trivial
 * (one insert, no extra queries) and covered implicitly by integration.
 */

const mockAdminClient = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
}));

import { logUsage } from './usage';

beforeEach(() => {
  mockAdminClient.from.mockReset();
  // Silence the handler's console.error during the intentional-failure
  // branches so the test output stays readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('logUsage', () => {
  it('takes the hot path with no extra queries on a clean insert', async () => {
    const insertCall = vi
      .fn<(payload: Record<string, unknown>) => unknown>()
      .mockResolvedValue({ error: null });
    const fromCall = vi.fn(() => ({
      insert: insertCall,
      select: vi.fn(),
      update: vi.fn(),
    }));
    mockAdminClient.from.mockImplementation(fromCall);

    await logUsage({
      service: 'openrouter',
      model: 'anthropic/claude-haiku',
      feature: 'nerd_chat',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      costUsd: 0.00012,
      userId: 'u-1',
      userEmail: 'jack@nativz.io',
      metadata: { openrouter_generation_id: 'gen-123' },
    });

    expect(fromCall).toHaveBeenCalledTimes(1); // single from('api_usage_logs')
    expect(insertCall).toHaveBeenCalledTimes(1);
    const payload = insertCall.mock.calls[0][0];
    expect(payload).toMatchObject({
      service: 'openrouter',
      feature: 'nerd_chat',
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      cost_usd: 0.00012,
      user_id: 'u-1',
      user_email: 'jack@nativz.io',
    });
    expect((payload.metadata as Record<string, unknown>).openrouter_generation_id).toBe(
      'gen-123',
    );
  });

  it('on a 23505 conflict with a generation id, merges local attribution onto the existing row without touching cost/tokens', async () => {
    // Insert → unique_violation; select → finds the webhook-written row;
    // update → applies our feature/user_id/metadata without altering
    // cost/tokens (the webhook's truth stays put).
    const insertCall = vi
      .fn<(payload: Record<string, unknown>) => unknown>()
      .mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'webhook-row-uuid',
        metadata: { openrouter_generation_id: 'gen-race', reconciled_only: true },
      },
      error: null,
    });
    const limit = vi.fn(() => ({ maybeSingle }));
    const contains = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ contains }));

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const updateCall = vi.fn<(payload: Record<string, unknown>) => unknown>(() => ({
      eq: updateEq,
    }));

    mockAdminClient.from.mockImplementation(() => ({
      insert: insertCall,
      select,
      update: updateCall,
    }));

    await logUsage({
      service: 'openrouter',
      model: 'anthropic/claude-haiku',
      feature: 'nerd_chat',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      costUsd: 0.00012,
      userId: 'u-2',
      userEmail: 'caller@nativz.io',
      metadata: { openrouter_generation_id: 'gen-race', localHint: 'started-the-request' },
    });

    expect(insertCall).toHaveBeenCalledTimes(1);
    expect(updateCall).toHaveBeenCalledTimes(1);

    const updatePayload = updateCall.mock.calls[0][0];
    expect(updatePayload).toMatchObject({
      service: 'openrouter',
      feature: 'nerd_chat',
      user_id: 'u-2',
      user_email: 'caller@nativz.io',
    });
    // Critical: cost + tokens must NOT appear on the merge update — the
    // webhook already wrote them and they're the trustworthy numbers.
    expect(updatePayload).not.toHaveProperty('cost_usd');
    expect(updatePayload).not.toHaveProperty('input_tokens');
    expect(updatePayload).not.toHaveProperty('output_tokens');
    expect(updatePayload).not.toHaveProperty('total_tokens');

    // Metadata should preserve the webhook's reconciled_only flag AND layer
    // our local hint on top.
    const mergedMeta = updatePayload.metadata as Record<string, unknown>;
    expect(mergedMeta.openrouter_generation_id).toBe('gen-race');
    expect(mergedMeta.reconciled_only).toBe(true);
    expect(mergedMeta.localHint).toBe('started-the-request');

    expect(updateEq).toHaveBeenCalledWith('id', 'webhook-row-uuid');
  });

  it('logs and returns on a 23505 conflict when the row lookup comes back empty (transient)', async () => {
    const insertCall = vi
      .fn()
      .mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const limit = vi.fn(() => ({ maybeSingle }));
    const contains = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ contains }));
    const updateCall = vi.fn();

    mockAdminClient.from.mockImplementation(() => ({
      insert: insertCall,
      select,
      update: updateCall,
    }));

    await logUsage({
      service: 'openrouter',
      model: 'anthropic/claude-haiku',
      feature: 'nerd_chat',
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      costUsd: 0,
      metadata: { openrouter_generation_id: 'gen-ghost' },
    });

    // We do not update a row we can't find — and critically, we do not
    // insert again (that would loop forever on persistent conflicts).
    expect(updateCall).not.toHaveBeenCalled();
  });

  it('does NOT take the reverse-race path for non-OpenRouter services (no generation id)', async () => {
    // Gemini / Dashscope / Groq etc. don't send OpenRouter generation ids,
    // so a 23505 is real breakage and should just log + return — we
    // should never try to read another row.
    const insertCall = vi
      .fn()
      .mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });
    const select = vi.fn();
    const updateCall = vi.fn();

    mockAdminClient.from.mockImplementation(() => ({
      insert: insertCall,
      select,
      update: updateCall,
    }));

    await logUsage({
      service: 'gemini',
      model: 'gemini-embedding-001',
      feature: 'knowledge_embedding',
      inputTokens: 10,
      outputTokens: 0,
      totalTokens: 10,
      costUsd: 0,
    });

    expect(select).not.toHaveBeenCalled();
    expect(updateCall).not.toHaveBeenCalled();
  });

  it('logs and returns on a non-conflict insert error (no retry loop)', async () => {
    const insertCall = vi
      .fn()
      .mockResolvedValue({ error: { code: '42P01', message: 'relation does not exist' } });
    const select = vi.fn();
    const updateCall = vi.fn();
    mockAdminClient.from.mockImplementation(() => ({
      insert: insertCall,
      select,
      update: updateCall,
    }));

    await logUsage({
      service: 'openrouter',
      model: 'anthropic/claude-haiku',
      feature: 'nerd_chat',
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      costUsd: 0,
      metadata: { openrouter_generation_id: 'gen-sql-error' },
    });

    expect(select).not.toHaveBeenCalled();
    expect(updateCall).not.toHaveBeenCalled();
  });

  it('never throws even if the admin client blows up', async () => {
    mockAdminClient.from.mockImplementation(() => {
      throw new Error('connection refused');
    });

    // Non-blocking contract — callers should never have to .catch() it.
    await expect(
      logUsage({
        service: 'openrouter',
        model: 'anthropic/claude-haiku',
        feature: 'nerd_chat',
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        costUsd: 0,
      }),
    ).resolves.toBeUndefined();
  });
});
