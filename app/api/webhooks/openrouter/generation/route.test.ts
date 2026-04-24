import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the OpenRouter generation webhook.
 *
 * The handler touches Supabase through `createAdminClient`, so we mock the
 * whole module — each test rebuilds a thin fake admin client with just the
 * `from().select()...` / `from().insert()` / `from().update()` shape the
 * handler calls. Tests verify the three branches:
 *
 *   1. Wrong / missing secret  → 403
 *   2. Valid secret + matching row  → UPDATE existing row
 *   3. Valid secret + no match      → INSERT new reconciled row
 */

const mockAdminClient = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
}));

// Import AFTER the mock so the handler picks up our admin stub.
import { POST } from './route';

const SECRET = 'test-secret-xyz';

function buildRequest(
  body: Record<string, unknown>,
  opts: { secret?: string | null } = {},
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.secret !== null) {
    headers['x-cortex-webhook-secret'] = opts.secret ?? SECRET;
  }
  return new Request('https://cortex.nativz.io/api/webhooks/openrouter/generation', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.CORTEX_OPENROUTER_WEBHOOK_SECRET = SECRET;
  mockAdminClient.from.mockReset();
});

describe('POST /api/webhooks/openrouter/generation', () => {
  it('returns 503 when the server secret is not configured', async () => {
    delete process.env.CORTEX_OPENROUTER_WEBHOOK_SECRET;
    const res = await POST(buildRequest({ id: 'gen-1' }));
    expect(res.status).toBe(503);
  });

  it('returns 403 when the x-cortex-webhook-secret header is missing', async () => {
    const res = await POST(buildRequest({ id: 'gen-1' }, { secret: null }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the secret does not match', async () => {
    const res = await POST(buildRequest({ id: 'gen-1' }, { secret: 'wrong' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when the id is missing', async () => {
    const res = await POST(buildRequest({ model: 'anthropic/claude-haiku' }));
    expect(res.status).toBe(400);
  });

  it('patches an existing row when one matches the generation id', async () => {
    // Select → finds one row; update → succeeds. Explicit arg type on
    // updateCall so TypeScript keeps `.mock.calls[0][0]` typed instead of
    // inferring the zero-arg signature from `() => …`.
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const updateCall = vi.fn<(payload: Record<string, unknown>) => unknown>(() => ({
      eq: updateEq,
    }));
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'existing-row-uuid', metadata: { hint: 'client-logged' } },
      error: null,
    });
    const limit = vi.fn(() => ({ maybeSingle }));
    const contains = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ contains }));

    mockAdminClient.from.mockImplementation(() => ({
      select,
      update: updateCall,
      insert: vi.fn(),
    }));

    const res = await POST(
      buildRequest({
        id: 'gen-abc',
        model: 'anthropic/claude-haiku',
        tokens_prompt: 12,
        tokens_completion: 8,
        total_cost: 0.00034,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, reconciled: true });

    // Exactly one update happened, on the matched row id.
    expect(updateCall).toHaveBeenCalledTimes(1);
    const updatePayload = updateCall.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.input_tokens).toBe(12);
    expect(updatePayload.output_tokens).toBe(8);
    expect(updatePayload.total_tokens).toBe(20);
    expect(updatePayload.cost_usd).toBe(0.00034);
    const meta = updatePayload.metadata as Record<string, unknown>;
    expect(meta.openrouter_generation_id).toBe('gen-abc');
    expect(meta.hint).toBe('client-logged'); // preserved from the existing row
    expect(meta.reconciled_at).toBeTypeOf('string');
    expect(updateEq).toHaveBeenCalledWith('id', 'existing-row-uuid');
  });

  it('inserts a reconciled row when no match exists', async () => {
    // Select → finds nothing; insert → succeeds.
    const insertCall = vi
      .fn<(payload: Record<string, unknown>) => unknown>()
      .mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const limit = vi.fn(() => ({ maybeSingle }));
    const contains = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ contains }));

    mockAdminClient.from.mockImplementation(() => ({
      select,
      update: vi.fn(),
      insert: insertCall,
    }));

    const res = await POST(
      buildRequest({
        id: 'gen-new',
        model: 'openai/gpt-5.4-mini',
        tokens_prompt: 5,
        tokens_completion: 10,
        total_cost: 0.0001,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, reconciled: false });

    expect(insertCall).toHaveBeenCalledTimes(1);
    const insertPayload = insertCall.mock.calls[0][0] as Record<string, unknown>;
    expect(insertPayload.service).toBe('openrouter');
    expect(insertPayload.feature).toBe('reconciled');
    expect(insertPayload.total_tokens).toBe(15);
    const meta = insertPayload.metadata as Record<string, unknown>;
    expect(meta.openrouter_generation_id).toBe('gen-new');
    expect(meta.reconciled_only).toBe(true);
  });

  it('handles the insert-race case by retrying as an update', async () => {
    // First select → miss; insert → unique-violation (another webhook
    // delivery raced us); second select → finds the winning row; update
    // runs so the final numbers still reflect THIS payload.
    let selectCalls = 0;
    const maybeSingle = vi.fn(async () => {
      selectCalls += 1;
      if (selectCalls === 1) return { data: null, error: null };
      return {
        data: { id: 'winner-row-uuid', metadata: {} },
        error: null,
      };
    });
    const limit = vi.fn(() => ({ maybeSingle }));
    const contains = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ contains }));

    const insertCall = vi.fn().mockResolvedValue({
      error: { code: '23505', message: 'duplicate key' },
    });

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const updateCall = vi.fn(() => ({ eq: updateEq }));

    mockAdminClient.from.mockImplementation(() => ({
      select,
      insert: insertCall,
      update: updateCall,
    }));

    const res = await POST(
      buildRequest({
        id: 'gen-race',
        model: 'anthropic/claude-haiku',
        tokens_prompt: 3,
        tokens_completion: 4,
        total_cost: 0.00002,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      reconciled: true,
      raced: true,
    });
    expect(insertCall).toHaveBeenCalledTimes(1);
    expect(updateCall).toHaveBeenCalledTimes(1);
    expect(updateEq).toHaveBeenCalledWith('id', 'winner-row-uuid');
  });

  it('returns 500 when the insert fails for a non-conflict reason', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const limit = vi.fn(() => ({ maybeSingle }));
    const contains = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ contains }));

    const insertCall = vi.fn().mockResolvedValue({
      error: { code: '42P01', message: 'relation does not exist' },
    });

    mockAdminClient.from.mockImplementation(() => ({
      select,
      insert: insertCall,
      update: vi.fn(),
    }));

    const res = await POST(
      buildRequest({ id: 'gen-broken', tokens_prompt: 1, tokens_completion: 1, total_cost: 0 }),
    );
    expect(res.status).toBe(500);
  });
});
