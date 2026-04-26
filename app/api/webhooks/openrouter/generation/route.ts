import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logApiError } from '@/lib/api/error-log';

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
 * Two payload shapes are accepted:
 *
 *   1. Legacy generation event (single object):
 *        {
 *          id, model, created_at, tokens_prompt, tokens_completion,
 *          total_cost, metadata?
 *        }
 *
 *   2. OpenTelemetry trace export (current — `resourceSpans` envelope).
 *      OpenRouter switched to OTel GenAI semantic conventions; each span
 *      represents one generation. Attributes use the
 *      `gen_ai.*` namespace (with a few openrouter-specific keys for cost).
 *
 * Idempotency: upserts on `metadata->>openrouter_generation_id` so re-deliveries
 * don't double-count. If no matching row exists we insert a new one tagged
 * with `service=openrouter` and `feature=reconciled`.
 */

interface NormalizedGenerationEvent {
  id: string;
  model: string;
  createdAt: string;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  extraMetadata?: Record<string, unknown>;
}

interface OtelKeyValue {
  key?: unknown;
  value?: unknown;
}

interface OtelSpan {
  attributes?: unknown;
  endTimeUnixNano?: unknown;
  startTimeUnixNano?: unknown;
}

interface OtelScopeSpans {
  spans?: unknown;
}

interface OtelResourceSpan {
  resource?: { attributes?: unknown } | unknown;
  scopeSpans?: unknown;
}

/**
 * Pull a primitive value out of an OTel `AnyValue`. OTel attribute values are
 * tagged unions: `{ stringValue }`, `{ intValue }`, `{ doubleValue }`, etc.
 * We treat string/number variants as the only ones worth reading.
 */
function readOtelValue(raw: unknown): string | number | null {
  if (raw == null || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.stringValue === 'string') return v.stringValue;
  if (typeof v.intValue === 'number') return v.intValue;
  // intValue often arrives as a string for int64 safety — coerce.
  if (typeof v.intValue === 'string' && v.intValue.trim() !== '') {
    const n = Number(v.intValue);
    if (Number.isFinite(n)) return n;
  }
  if (typeof v.doubleValue === 'number') return v.doubleValue;
  if (typeof v.boolValue === 'boolean') return v.boolValue ? 1 : 0;
  return null;
}

function attributesToMap(raw: unknown): Map<string, string | number> {
  const out = new Map<string, string | number>();
  if (!Array.isArray(raw)) return out;
  for (const kv of raw as OtelKeyValue[]) {
    const k = typeof kv?.key === 'string' ? kv.key : null;
    if (!k) continue;
    const val = readOtelValue(kv.value);
    if (val == null) continue;
    out.set(k, val);
  }
  return out;
}

/**
 * First non-null lookup across a list of attribute keys. OpenTelemetry's
 * GenAI conventions evolved (`prompt_tokens` → `input_tokens`); accept either.
 */
function firstAttr(
  attrs: Map<string, string | number>,
  keys: string[],
): string | number | null {
  for (const k of keys) {
    const v = attrs.get(k);
    if (v != null) return v;
  }
  return null;
}

function asNumber(v: string | number | null): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asString(v: string | number | null): string {
  if (v == null) return '';
  return typeof v === 'string' ? v : String(v);
}

/**
 * Convert an OTel span representing one chat completion into our internal
 * generation event. Returns null if the span lacks a generation id — we can't
 * reconcile without one.
 */
function spanToGenerationEvent(
  span: OtelSpan,
  resourceAttrs: Map<string, string | number>,
): NormalizedGenerationEvent | null {
  const spanAttrs = attributesToMap(span.attributes);
  // Resource-level attributes (e.g. `gen_ai.system`) are common to every
  // span on the request; merge so per-span lookups can find them.
  const merged = new Map(resourceAttrs);
  for (const [k, v] of spanAttrs) merged.set(k, v);

  const idRaw = firstAttr(merged, [
    'gen_ai.response.id',
    'gen_ai.request.id',
    'openrouter.generation_id',
    'generation_id',
  ]);
  const id = asString(idRaw).trim();
  if (!id) return null;

  const model = asString(
    firstAttr(merged, [
      'gen_ai.response.model',
      'gen_ai.request.model',
      'openrouter.model',
      'model',
    ]),
  ).trim() || 'unknown';

  const promptTokens = asNumber(
    firstAttr(merged, [
      'gen_ai.usage.input_tokens',
      'gen_ai.usage.prompt_tokens',
      'openrouter.tokens_prompt',
    ]),
  );
  const completionTokens = asNumber(
    firstAttr(merged, [
      'gen_ai.usage.output_tokens',
      'gen_ai.usage.completion_tokens',
      'openrouter.tokens_completion',
    ]),
  );
  const totalCost = asNumber(
    firstAttr(merged, [
      'gen_ai.usage.cost',
      'gen_ai.response.cost',
      'openrouter.cost',
      'openrouter.total_cost',
      'cost',
    ]),
  );

  const endNanoRaw = span.endTimeUnixNano ?? span.startTimeUnixNano;
  let createdAt = new Date().toISOString();
  if (typeof endNanoRaw === 'string' || typeof endNanoRaw === 'number') {
    const ns = typeof endNanoRaw === 'string' ? Number(endNanoRaw) : endNanoRaw;
    if (Number.isFinite(ns) && ns > 0) {
      createdAt = new Date(ns / 1_000_000).toISOString();
    }
  }

  return {
    id,
    model,
    createdAt,
    promptTokens,
    completionTokens,
    totalCost,
    extraMetadata: { otel: true },
  };
}

function parseOtelPayload(body: unknown): NormalizedGenerationEvent[] {
  const root = body as { resourceSpans?: unknown };
  if (!root || !Array.isArray(root.resourceSpans)) return [];

  const events: NormalizedGenerationEvent[] = [];
  for (const rs of root.resourceSpans as OtelResourceSpan[]) {
    const resourceAttrsRaw = (rs?.resource as { attributes?: unknown } | undefined)?.attributes;
    const resourceAttrs = attributesToMap(resourceAttrsRaw);
    if (!Array.isArray(rs?.scopeSpans)) continue;
    for (const ss of rs.scopeSpans as OtelScopeSpans[]) {
      if (!Array.isArray(ss?.spans)) continue;
      for (const span of ss.spans as OtelSpan[]) {
        const ev = spanToGenerationEvent(span, resourceAttrs);
        if (ev) events.push(ev);
      }
    }
  }
  return events;
}

function parseLegacyPayload(body: unknown): NormalizedGenerationEvent[] {
  const b = body as {
    id?: unknown;
    model?: unknown;
    created_at?: unknown;
    tokens_prompt?: unknown;
    tokens_completion?: unknown;
    total_cost?: unknown;
    metadata?: unknown;
  } | null;
  if (!b || typeof b !== 'object') return [];
  const id = typeof b.id === 'string' ? b.id.trim() : '';
  if (!id) return [];
  const extraMetadata =
    b.metadata && typeof b.metadata === 'object' && !Array.isArray(b.metadata)
      ? (b.metadata as Record<string, unknown>)
      : undefined;
  return [
    {
      id,
      model: typeof b.model === 'string' ? b.model : 'unknown',
      createdAt: typeof b.created_at === 'string' ? b.created_at : new Date().toISOString(),
      promptTokens: Number(b.tokens_prompt ?? 0) || 0,
      completionTokens: Number(b.tokens_completion ?? 0) || 0,
      totalCost: Number(b.total_cost ?? 0) || 0,
      extraMetadata,
    },
  ];
}

/**
 * Reconcile or insert a single generation event. Returns true when a row was
 * touched; false when something failed in a way the caller should report.
 */
async function applyGenerationEvent(
  admin: ReturnType<typeof createAdminClient>,
  ev: NormalizedGenerationEvent,
): Promise<{ ok: true; reconciled: boolean } | { ok: false; reason: string }> {
  const total = ev.promptTokens + ev.completionTokens;

  const { data: existing } = await admin
    .from('api_usage_logs')
    .select('id, metadata')
    .contains('metadata', { openrouter_generation_id: ev.id })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const prevMeta =
      existing.metadata && typeof existing.metadata === 'object'
        ? (existing.metadata as Record<string, unknown>)
        : {};
    await admin
      .from('api_usage_logs')
      .update({
        input_tokens: ev.promptTokens,
        output_tokens: ev.completionTokens,
        total_tokens: total,
        cost_usd: ev.totalCost,
        metadata: {
          ...prevMeta,
          ...(ev.extraMetadata ?? {}),
          openrouter_generation_id: ev.id,
          reconciled_at: new Date().toISOString(),
        },
      })
      .eq('id', existing.id);
    return { ok: true, reconciled: true };
  }

  const insertPayload = {
    service: 'openrouter',
    model: ev.model,
    feature: 'reconciled',
    input_tokens: ev.promptTokens,
    output_tokens: ev.completionTokens,
    total_tokens: total,
    cost_usd: ev.totalCost,
    created_at: ev.createdAt,
    metadata: {
      ...(ev.extraMetadata ?? {}),
      openrouter_generation_id: ev.id,
      reconciled_only: true,
      reconciled_at: new Date().toISOString(),
    },
  };

  const { error: insertError } = await admin.from('api_usage_logs').insert(insertPayload);
  if (!insertError) return { ok: true, reconciled: false };

  // 23505 = unique_violation — concurrent delivery beat us. Retry as update.
  if (insertError.code !== '23505') {
    return { ok: false, reason: insertError.message };
  }

  const { data: raced } = await admin
    .from('api_usage_logs')
    .select('id, metadata')
    .contains('metadata', { openrouter_generation_id: ev.id })
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
        input_tokens: ev.promptTokens,
        output_tokens: ev.completionTokens,
        total_tokens: total,
        cost_usd: ev.totalCost,
        metadata: {
          ...prevMeta,
          ...(ev.extraMetadata ?? {}),
          openrouter_generation_id: ev.id,
          reconciled_at: new Date().toISOString(),
        },
      })
      .eq('id', raced.id);
  }
  return { ok: true, reconciled: true };
}

export async function POST(req: Request) {
  const expected = process.env.CORTEX_OPENROUTER_WEBHOOK_SECRET;
  if (!expected) {
    logApiError({
      route: '/api/webhooks/openrouter/generation',
      statusCode: 503,
      errorMessage: 'CORTEX_OPENROUTER_WEBHOOK_SECRET not set',
    }).catch(() => {});
    return NextResponse.json(
      { error: 'Webhook secret not configured on the server' },
      { status: 503 },
    );
  }

  const got = req.headers.get('x-cortex-webhook-secret');
  if (got !== expected) {
    logApiError({
      route: '/api/webhooks/openrouter/generation',
      statusCode: 403,
      errorMessage: 'Bad or missing x-cortex-webhook-secret header',
      meta: { hadHeader: got !== null },
    }).catch(() => {});
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logApiError({
      route: '/api/webhooks/openrouter/generation',
      statusCode: 400,
      errorMessage: 'Invalid JSON body',
    }).catch(() => {});
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const isOtel =
    !!body &&
    typeof body === 'object' &&
    Array.isArray((body as { resourceSpans?: unknown }).resourceSpans);

  const events = isOtel ? parseOtelPayload(body) : parseLegacyPayload(body);

  if (events.length === 0) {
    // OTel envelope with no recognizable generation spans — log the keys
    // so we can refine the parser if OpenRouter introduces new attribute
    // names. Return 200 so OpenRouter doesn't keep retrying a payload we
    // legitimately can't reconcile.
    const topKeys =
      body && typeof body === 'object' ? Object.keys(body as object) : [];
    logApiError({
      route: '/api/webhooks/openrouter/generation',
      statusCode: 200,
      errorMessage: isOtel
        ? 'OTel payload had no generation spans we could parse'
        : 'Missing generation id in webhook payload',
      meta: { otel: isOtel, keys: topKeys.slice(0, 16) },
    }).catch(() => {});
    return NextResponse.json({ ok: true, processed: 0, reason: 'no_events' });
  }

  const admin = createAdminClient();
  let reconciledCount = 0;
  let insertedCount = 0;
  const failures: { id: string; reason: string }[] = [];

  for (const ev of events) {
    const res = await applyGenerationEvent(admin, ev);
    if (!res.ok) {
      failures.push({ id: ev.id, reason: res.reason });
      continue;
    }
    if (res.reconciled) reconciledCount += 1;
    else insertedCount += 1;
  }

  if (failures.length > 0) {
    logApiError({
      route: '/api/webhooks/openrouter/generation',
      statusCode: 500,
      errorMessage: `Failed to apply ${failures.length}/${events.length} generation events`,
      errorDetail: failures.map((f) => `${f.id}: ${f.reason}`).join('; ').slice(0, 500),
      meta: { otel: isOtel },
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    otel: isOtel,
    processed: events.length,
    reconciled: reconciledCount,
    inserted: insertedCount,
    failures: failures.length,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/webhooks/openrouter/generation',
    method: 'POST',
    headers: ['x-cortex-webhook-secret'],
    env: ['CORTEX_OPENROUTER_WEBHOOK_SECRET'],
    payloads: ['legacy generation event', 'OpenTelemetry resourceSpans'],
  });
}
