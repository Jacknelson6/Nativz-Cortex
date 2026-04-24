import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/webhooks/openrouter/generation
 *
 * Accepts OpenRouter's per-generation webhook. OpenRouter POSTs after each
 * chat completion with the cost-true numbers (their billing number, not our
 * local price-table estimate), so we can reconcile `api_usage_logs.cost_usd`
 * to match what we'll actually be charged at month-end.
 *
 * Security: shared-secret check via the `x-cortex-webhook-secret` header.
 * OpenRouter's dashboard lets you set a header/secret pair per webhook
 * destination — put CORTEX_OPENROUTER_WEBHOOK_SECRET there.
 *
 * Expected payload shape (subset — we ignore fields we don't need):
 *   {
 *     id: string,              // generation id
 *     model: string,           // "anthropic/claude-3.5-haiku" etc.
 *     created_at: string,      // ISO
 *     tokens_prompt: number,
 *     tokens_completion: number,
 *     total_cost: number,      // USD
 *     metadata?: Record<string, unknown>,
 *   }
 *
 * Idempotency: upserts on `metadata->>openrouter_generation_id` so re-deliveries
 * don't double-count. If no matching row exists we insert a new one tagged
 * with `service=openrouter` and `feature=reconciled`.
 */
export async function POST(req: Request) {
  const expected = process.env.CORTEX_OPENROUTER_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: 'Webhook secret not configured on the server' },
      { status: 503 },
    );
  }

  const got = req.headers.get('x-cortex-webhook-secret');
  if (got !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    id?: string;
    model?: string;
    created_at?: string;
    tokens_prompt?: number;
    tokens_completion?: number;
    total_cost?: number;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const generationId = body.id?.trim();
  if (!generationId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const admin = createAdminClient();
  const input = Number(body.tokens_prompt ?? 0);
  const output = Number(body.tokens_completion ?? 0);
  const total = input + output;
  const cost = Number(body.total_cost ?? 0);

  // Look for the client-side row that fired when we issued the request.
  // Match on metadata.openrouter_generation_id (GIN-indexed in migration
  // 161 so the lookup stays fast as the table grows).
  const { data: existing } = await admin
    .from('api_usage_logs')
    .select('id, metadata')
    .contains('metadata', { openrouter_generation_id: generationId })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    // Update branch — the usual happy path. Preserve any metadata the
    // client stamped (user_id hints, feature-specific fields, etc.) and
    // layer the reconciliation marker on top.
    const prevMeta =
      existing.metadata && typeof existing.metadata === 'object'
        ? (existing.metadata as Record<string, unknown>)
        : {};
    await admin
      .from('api_usage_logs')
      .update({
        input_tokens: input,
        output_tokens: output,
        total_tokens: total,
        cost_usd: cost,
        metadata: {
          ...prevMeta,
          ...(body.metadata ?? {}),
          openrouter_generation_id: generationId,
          reconciled_at: new Date().toISOString(),
        },
      })
      .eq('id', existing.id);
    return NextResponse.json({ ok: true, reconciled: true });
  }

  // Insert branch — either the webhook arrived before our client insert
  // (possible if the local log failed or is still in flight) or the
  // generation id never landed in the DB. The unique partial index on
  // metadata->>'openrouter_generation_id' (migration 161) guarantees
  // that concurrent webhook retries can't race in two copies — on the
  // second attempt we catch 23505 and fall back to the update path.
  const insertPayload = {
    service: 'openrouter',
    model: body.model ?? 'unknown',
    feature: 'reconciled',
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    cost_usd: cost,
    created_at: body.created_at ?? new Date().toISOString(),
    metadata: {
      ...(body.metadata ?? {}),
      openrouter_generation_id: generationId,
      reconciled_only: true,
      reconciled_at: new Date().toISOString(),
    },
  };

  const { error: insertError } = await admin.from('api_usage_logs').insert(insertPayload);
  if (!insertError) {
    return NextResponse.json({ ok: true, reconciled: false });
  }

  // 23505 = unique_violation. A concurrent delivery beat us to the row;
  // retry as an update so the final state still matches this payload.
  if (insertError.code !== '23505') {
    return NextResponse.json(
      { error: 'Failed to write row', detail: insertError.message },
      { status: 500 },
    );
  }

  const { data: raced } = await admin
    .from('api_usage_logs')
    .select('id, metadata')
    .contains('metadata', { openrouter_generation_id: generationId })
    .limit(1)
    .maybeSingle();
  if (raced?.id) {
    const prevMeta =
      raced.metadata && typeof raced.metadata === 'object'
        ? (raced.metadata as Record<string, unknown>)
        : {};
    await admin
      .from('api_usage_logs')
      .update({
        input_tokens: input,
        output_tokens: output,
        total_tokens: total,
        cost_usd: cost,
        metadata: {
          ...prevMeta,
          ...(body.metadata ?? {}),
          openrouter_generation_id: generationId,
          reconciled_at: new Date().toISOString(),
        },
      })
      .eq('id', raced.id);
  }
  return NextResponse.json({ ok: true, reconciled: true, raced: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/webhooks/openrouter/generation',
    method: 'POST',
    headers: ['x-cortex-webhook-secret'],
    env: ['CORTEX_OPENROUTER_WEBHOOK_SECRET'],
  });
}
