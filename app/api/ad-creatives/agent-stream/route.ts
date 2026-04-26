import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAdGenerator, type AdAgentEvent } from '@/lib/ad-creatives/ad-agent';
import { mapImageErrorToResponse } from '@/lib/ad-creatives/error-response';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// 30 ads at the legacy 2-up render concurrency reliably finish under the
// route's 300s ceiling. Larger asks would gamble on Vercel's wall clock —
// the legacy /generate route enforces the same cap.
const bodySchema = z.object({
  clientId: z.string().uuid(),
  prompt: z.string().min(3).max(4000),
  count: z.coerce.number().int().min(1).max(30).default(20),
});

/**
 * SSE endpoint that runs the ad generator agent and forwards every
 * `AdAgentEvent` the run emits as `data: <json>\n\n` chunks. The browser
 * consumes this stream via `fetch` + `ReadableStream` (not `EventSource`,
 * because we need to send a POST body) and parses each SSE frame back into
 * an `AdAgentEvent` to drive the live transcript.
 *
 * Persistence model:
 *   - The user brief lands in `ad_generator_messages` before the run starts.
 *   - The final agent narration lands as one assistant message after
 *     `batch_complete`. Tool boundaries and per-render progress are
 *     intentionally NOT persisted — they're ephemeral activity, not a
 *     permanent chat record.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError('Unauthorized', 401);
  }

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) {
    return jsonError('Forbidden', 403);
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError('Invalid body', 400);
  }
  const { clientId, prompt, count } = parsed.data;

  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) {
    return jsonError('Client not found', 404);
  }

  await admin.from('ad_generator_messages').insert({
    client_id: clientId,
    role: 'user',
    content: prompt,
    command: null,
    author_user_id: user.id,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastAgentMessage: string | null = null;
      let finalBatchId: string | null = null;

      const send = (event: AdAgentEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // Stream already closed (client disconnected). Swallow to avoid
          // crashing the agent run mid-flight.
        }
      };

      try {
        const result = await runAdGenerator({
          clientId,
          prompt,
          count,
          userId: user.id,
          userEmail: user.email ?? null,
          onEvent: (event) => {
            if (event.type === 'agent_message') {
              lastAgentMessage = event.text;
            }
            if (event.type === 'batch_complete') {
              finalBatchId = event.batchId || null;
            }
            send(event);
          },
        });

        const summary = lastAgentMessage ?? result.summary;
        await admin.from('ad_generator_messages').insert({
          client_id: clientId,
          role: 'assistant',
          content: summary,
          command: null,
          metadata: {
            batch_status: result.status,
            concept_count: result.concepts.length,
            reference_ads_used: result.referenceAdsUsed,
            orchestrator: 'openai_agents_sdk',
          },
          batch_id: finalBatchId ?? result.batchId,
          author_user_id: user.id,
        });
      } catch (err) {
        const mapped = mapImageErrorToResponse(err);
        send({
          type: 'batch_error',
          code: mapped.body.code,
          message: mapped.body.error,
        });
        await admin.from('ad_generator_messages').insert({
          client_id: clientId,
          role: 'assistant',
          content: mapped.body.error,
          command: null,
          metadata: {
            batch_status: 'failed',
            error_code: mapped.body.code,
            orchestrator: 'openai_agents_sdk',
          },
          batch_id: null,
          author_user_id: user.id,
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
