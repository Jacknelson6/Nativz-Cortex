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

  // Try to locate an existing row (e.g. the client-side log that fired when
  // we issued the request). Match on metadata.openrouter_generation_id.
  const { data: existing } = await admin
    .from('api_usage_logs')
    .select('id, cost_usd')
    .contains('metadata', { openrouter_generation_id: generationId })
    .limit(1)
    .maybeSingle();

  const input = Number(body.tokens_prompt ?? 0);
  const output = Number(body.tokens_completion ?? 0);
  const total = input + output;
  const cost = Number(body.total_cost ?? 0);

  if (existing?.id) {
    await admin
      .from('api_usage_logs')
      .update({
        input_tokens: input,
        output_tokens: output,
        total_tokens: total,
        cost_usd: cost,
        // preserve the original metadata and tack on the reconciliation stamp
        metadata: {
          ...(body.metadata ?? {}),
          openrouter_generation_id: generationId,
          reconciled_at: new Date().toISOString(),
        },
      })
      .eq('id', existing.id);
  } else {
    await admin.from('api_usage_logs').insert({
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
      },
    });
  }

  return NextResponse.json({ ok: true, reconciled: Boolean(existing?.id) });
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
