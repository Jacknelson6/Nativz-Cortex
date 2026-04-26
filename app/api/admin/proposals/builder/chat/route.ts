import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registerAllTools } from '@/lib/nerd/tools';
import { getTool, getAllTools } from '@/lib/nerd/registry';
import { getActiveModel } from '@/lib/ai/client';
import { resolveOpenRouterApiKeyForFeature } from '@/lib/ai/provider-keys';
import { calculateCost, trackUsage } from '@/lib/ai/usage';

// Register tools on module load.
registerAllTools();

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ChatMessage = z.object({
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string(),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
});

const Body = z.object({
  draft_id: z.string().uuid(),
  message: z.string().min(1).max(4000),
  history: z.array(ChatMessage).default([]),
});

/**
 * Inline chat for /admin/proposals/builder.
 *
 * Single-turn (non-streaming) but with full tool-call loop: the LLM can
 * fire any of the proposal-builder tools (add_service_line, etc.), the
 * results feed back, and we keep looping until the model returns plain
 * text. Caps at 8 iterations to bound runaway loops.
 *
 * History is client-managed — the component keeps the message array
 * locally and posts it back on each turn. Conversation persistence can
 * come later; the proposal_drafts row is the durable artifact.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad body' }, { status: 400 });
  }
  const { draft_id, message, history } = parsed.data;

  // Verify the draft exists + load enough state to bias the system prompt.
  const { data: draft } = await admin
    .from('proposal_drafts')
    .select('id, agency, title, status, signer_name, signer_email, payment_model, cadence, total_cents, deposit_cents, service_lines, clients(name, slug)')
    .eq('id', draft_id)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });

  // Filter the global tool registry to only proposal-builder tools so the
  // model isn't tempted to fire unrelated stuff (list_clients, etc.).
  const ALLOWED_TOOLS = new Set([
    'list_proposal_services',
    'create_proposal_draft',
    'add_service_line',
    'update_service_line',
    'update_draft_signer',
    'set_draft_payment_model',
    'add_draft_block',
    'preview_draft',
    'commit_proposal_draft',
  ]);
  const proposalTools = getAllTools().filter((t) => ALLOWED_TOOLS.has(t.name));
  const toolsForApi = proposalTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: schemaForApi(tool.parameters),
    },
  }));

  const systemPrompt = buildSystemPrompt(draft as DraftSummary);

  // Conversation: system + history + new user message.
  type ApiMsg = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    name?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  };
  const messages: ApiMsg[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({
      role: h.role,
      content: h.content,
      tool_call_id: h.tool_call_id,
      name: h.name,
    })) as ApiMsg[],
    { role: 'user', content: message },
  ];

  const apiKey = await resolveOpenRouterApiKeyForFeature('proposals.builder.chat');
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
  }
  const model = await getActiveModel();

  type ToolEvent = { tool: string; success: boolean; data?: unknown; error?: string };
  const toolEvents: ToolEvent[] = [];

  for (let iter = 0; iter < 8; iter++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io',
        'X-Title': 'Cortex Proposal Builder',
      },
      body: JSON.stringify({
        model,
        messages,
        tools: toolsForApi,
        max_tokens: 2000,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `LLM error (${res.status})`, detail: errText.slice(0, 400) },
        { status: 502 },
      );
    }
    const json = await res.json();

    // Track this iteration's generation. The proposals builder loops up to 8
    // times — each iteration is a real OpenRouter call and needs its own row
    // so /admin/usage shows the full conversation cost.
    const usage = json?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    const generationId = typeof json?.id === 'string' ? (json.id as string).trim() : '';
    trackUsage({
      service: 'openrouter',
      model,
      feature: 'proposals_builder_chat',
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd: calculateCost(model, promptTokens, completionTokens),
      userId: user.id,
      userEmail: user.email ?? undefined,
      metadata: generationId ? { openrouter_generation_id: generationId } : undefined,
    });

    const choice = json?.choices?.[0];
    if (!choice) {
      return NextResponse.json({ error: 'LLM returned no choice' }, { status: 502 });
    }
    const msg = choice.message as {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Final assistant text. We're done.
      return NextResponse.json({
        ok: true,
        assistant: msg.content ?? '',
        tool_events: toolEvents,
      });
    }

    // Push the assistant turn (with tool_calls) onto the history.
    messages.push({
      role: 'assistant',
      content: msg.content ?? '',
      tool_calls: toolCalls,
    });

    // Execute every tool call sequentially. Append a tool message per call.
    for (const tc of toolCalls) {
      const tool = getTool(tc.function.name);
      if (!tool || !ALLOWED_TOOLS.has(tc.function.name)) {
        const errResult = { success: false, error: `Tool ${tc.function.name} is not available in the proposal builder.` };
        toolEvents.push({ tool: tc.function.name, success: false, error: errResult.error });
        messages.push({
          role: 'tool',
          content: JSON.stringify(errResult),
          tool_call_id: tc.id,
        });
        continue;
      }
      let args: unknown;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        const errResult = { success: false, error: 'Tool arguments not valid JSON.' };
        toolEvents.push({ tool: tc.function.name, success: false, error: errResult.error });
        messages.push({ role: 'tool', content: JSON.stringify(errResult), tool_call_id: tc.id });
        continue;
      }
      try {
        const result = await tool.handler(args as Record<string, unknown>, user.id);
        toolEvents.push({
          tool: tc.function.name,
          success: !!result.success,
          data: result.data,
          error: result.success ? undefined : result.error,
        });
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: tc.id,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolEvents.push({ tool: tc.function.name, success: false, error: message });
        messages.push({
          role: 'tool',
          content: JSON.stringify({ success: false, error: message }),
          tool_call_id: tc.id,
        });
      }
    }
    // Loop — let the LLM observe tool results and either fire more or
    // produce final text.
  }

  return NextResponse.json(
    {
      ok: true,
      assistant: 'I ran out of tool-call iterations. Try refreshing the preview and asking a more focused question.',
      tool_events: toolEvents,
    },
    { status: 200 },
  );
}

// ─── helpers ──────────────────────────────────────────────────────────

type DraftSummary = {
  id: string;
  agency: 'anderson' | 'nativz';
  title: string | null;
  status: string;
  signer_name: string | null;
  signer_email: string | null;
  payment_model: string;
  cadence: string | null;
  total_cents: number | null;
  deposit_cents: number | null;
  service_lines: Array<{ name_snapshot: string; quantity: number; unit_price_cents: number }>;
  clients: { name: string | null; slug: string | null } | Array<{ name: string | null; slug: string | null }> | null;
};

function buildSystemPrompt(draft: DraftSummary): string {
  const c = Array.isArray(draft.clients) ? draft.clients[0] : draft.clients;
  const lines = (draft.service_lines ?? [])
    .map((l) => `  - ${l.quantity} × ${l.name_snapshot} @ $${(l.unit_price_cents / 100).toFixed(0)} / unit`)
    .join('\n');
  const totals =
    draft.total_cents != null
      ? `Subtotal pre-discount → total $${(draft.total_cents / 100).toFixed(0)}, deposit $${((draft.deposit_cents ?? 0) / 100).toFixed(0)}.`
      : 'No totals yet.';

  return `You are the proposal builder agent for Cortex. The admin is composing a proposal in the inline split-pane builder; the right pane shows a live preview. Your job is to turn the admin's natural-language requests into precise tool calls against the current draft.

CURRENT DRAFT:
- ID: ${draft.id}
- Agency: ${draft.agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz'}
- Title: ${draft.title ?? '(untitled)'}
- Status: ${draft.status}
- Client: ${c?.name ?? '(no client linked)'}
- Signer: ${draft.signer_name ?? '?'} <${draft.signer_email ?? '?'}>
- Payment model: ${draft.payment_model}${draft.cadence ? ` (${draft.cadence})` : ''}
- Service lines:
${lines || '  (none yet)'}
- ${totals}

Tool guidelines:
1. ALWAYS pass draft_id="${draft.id}" to mutating tools.
2. When the admin says things like "add 12 short-form videos", call list_proposal_services first if you don't know the slug, then call add_service_line with service_slug + quantity.
3. When the admin asks for a discount that matches a configured pricing rule, just add the line — the engine auto-applies rules. If a manual override is needed, use update_service_line with unit_price_cents (cents, not dollars).
4. When the admin asks "show me the proposal" / "preview this", call preview_draft.
5. When the admin says "send this" / "ship it" / "commit it", call commit_proposal_draft. NEVER do this without explicit confirmation from the admin.
6. After tool calls, give a 1-sentence confirmation describing what changed and what the new total is. Be terse — the admin is watching the preview update.
7. Never fabricate prices. Only quote what list_proposal_services or the catalog returns. If unsure, ask the admin.
8. Never invent slugs. If the admin asks for a service that's not in list_proposal_services output, tell them and offer to add it as a free-form line.

You ARE allowed to ask clarifying questions when the request is ambiguous (e.g. "Did you mean monthly or one-time?").`;
}

// Convert a Zod schema to OpenAI-compatible JSON schema. Mirrors the
// implementation in lib/nerd/registry.ts; we duplicate inline to avoid
// pulling registry build-up state.
function schemaForApi(parameters: unknown): Record<string, unknown> {
  const raw = z.toJSONSchema(parameters as z.ZodType) as Record<string, unknown>;
  const { $schema: _ignored, ...rest } = raw;
  void _ignored;
  return rest;
}
