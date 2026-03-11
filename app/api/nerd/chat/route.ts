import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registerAllTools } from '@/lib/nerd/tools';
import { getAllTools, getTool, getToolsForAPI } from '@/lib/nerd/registry';
import type { ToolResult } from '@/lib/nerd/types';

// Register tools on module load
registerAllTools();

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const mentionSchema = z.object({
  type: z.enum(['client', 'team_member']),
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
});

const chatSchema = z.object({
  messages: z
    .array(z.object({
      role: z.enum(['user', 'assistant', 'tool']),
      content: z.string(),
      tool_call_id: z.string().optional(),
    }))
    .min(1),
  /** Parsed @mentions from the latest user message */
  mentions: z.array(mentionSchema).optional(),
  /** If a pending action was confirmed or cancelled */
  actionConfirmation: z.object({
    toolName: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    confirmed: z.boolean(),
  }).optional(),
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are "The Nerd" — the in-house social media marketing strategist for Nativz, a creative agency. You live inside Nativz Cortex, the agency's internal platform.

You are THE expert on:
- Social media marketing strategy (Instagram, TikTok, YouTube, Facebook)
- Short-form video content (hooks, pacing, trends, virality)
- Content pillar frameworks and editorial calendars
- Platform-specific best practices and algorithm behavior
- Audience growth, engagement optimization, and paid media amplification
- Brand voice development and content positioning

You have full access to every client in the Nativz portfolio and can take actions on their behalf using tools.

TOOL USAGE RULES:
- You have tools to manage tasks, schedule posts, view analytics, manage clients, shoots, moodboards, and more.
- Use tools proactively when the user's request implies an action (e.g., "create a task" → use create_task tool).
- When referring to clients or team members, users use @mentions. The system resolves these to IDs for you.
- For READ tools (listing, viewing): execute immediately and summarize results naturally.
- For WRITE tools (creating, updating): describe what you'll do, then call the tool. The frontend will show a confirmation card.
- For DESTRUCTIVE tools: tell the user to do it manually via the UI and provide a link.
- After a tool call completes, summarize the result in natural language. Don't just dump JSON.
- If a tool fails, explain the error clearly and suggest alternatives.
- You can call multiple tools in sequence if the user's request requires it.

BEHAVIOR RULES:
- Be direct, opinionated, and actionable. You're a senior strategist, not a generic chatbot.
- Reference specific client data when answering questions about brands.
- Use markdown formatting: headers, bullets, bold for emphasis. Keep it scannable.
- When you don't have data for something, say so — don't fabricate metrics.
- If analytics data is provided, analyze it with strategic insight, not just number recitation.
- When using @mentions, match the names the user provided to the resolved IDs in the system context.`;

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

interface ClientRow {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  topic_keywords: string[] | null;
  website_url: string | null;
  agency: string | null;
  services: string[] | null;
  preferences: Record<string, unknown> | null;
  health_score: string | null;
  logo_url: string | null;
}

interface SocialProfileRow {
  id: string;
  client_id: string;
  platform: string;
  username: string;
}

interface StrategyRow {
  client_id: string;
  executive_summary: string | null;
  content_pillars: unknown;
}

function buildClientSummary(c: ClientRow, profiles: SocialProfileRow[], strategy: StrategyRow | null): string {
  const parts: string[] = [];
  parts.push(`### ${c.name} (slug: ${c.slug}, id: ${c.id})`);
  if (c.agency) parts.push(`Agency: ${c.agency}`);
  if (c.industry) parts.push(`Industry: ${c.industry}`);
  if (c.services?.length) parts.push(`Services: ${c.services.join(', ')}`);
  if (c.target_audience) parts.push(`Target Audience: ${c.target_audience}`);
  if (c.brand_voice) parts.push(`Brand Voice: ${c.brand_voice}`);

  const prefs = c.preferences;
  if (prefs) {
    if ((prefs.tone_keywords as string[])?.length)
      parts.push(`Tone: ${(prefs.tone_keywords as string[]).join(', ')}`);
    if ((prefs.topics_lean_into as string[])?.length)
      parts.push(`Lean Into: ${(prefs.topics_lean_into as string[]).join(', ')}`);
    if (prefs.posting_frequency) parts.push(`Posting Frequency: ${prefs.posting_frequency}`);
  }

  if (profiles.length > 0) {
    parts.push(`Social Accounts:`);
    for (const p of profiles) {
      parts.push(`  - ${p.platform}: @${p.username} (profile_id: ${p.id})`);
    }
  }

  if (strategy?.executive_summary) {
    parts.push(`Strategy: ${strategy.executive_summary}`);
  }

  return parts.join('\n');
}

async function buildKnowledgeSummary(clientId: string): Promise<string> {
  try {
    const { getKnowledgeEntries, getBrandProfile } = await import('@/lib/knowledge/queries');
    const entries = await getKnowledgeEntries(clientId);
    if (entries.length === 0) return '';

    const parts: string[] = ['Knowledge Base:'];
    const counts: Record<string, number> = {};
    for (const e of entries) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    parts.push(`  Entries: ${Object.entries(counts).map(([t, c]) => `${c} ${t}(s)`).join(', ')}`);

    const brandProfile = await getBrandProfile(clientId);
    if (brandProfile) {
      parts.push(`  Brand Profile: ${brandProfile.content.substring(0, 300)}...`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await req.json();
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten() }), { status: 400 });
    }

    const { messages, mentions, actionConfirmation } = parsed.data;

    // --- Handle action confirmation (execute a pending write tool) ---
    if (actionConfirmation) {
      if (!actionConfirmation.confirmed) {
        return new Response(JSON.stringify({ type: 'action_cancelled' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const tool = getTool(actionConfirmation.toolName);
      if (!tool) {
        return new Response(JSON.stringify({ type: 'action_error', error: `Tool "${actionConfirmation.toolName}" not found` }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result = await tool.handler(actionConfirmation.arguments, user.id);
      return new Response(JSON.stringify({ type: 'action_result', result }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const admin = createAdminClient();

    // --- Load client portfolio context ---
    const { data: clients } = await admin
      .from('clients')
      .select('id, name, slug, industry, target_audience, brand_voice, topic_keywords, website_url, agency, services, preferences, health_score, logo_url')
      .eq('is_active', true)
      .order('name');

    const allClients = (clients ?? []) as ClientRow[];

    const { data: socialProfiles } = await admin
      .from('social_profiles')
      .select('id, client_id, platform, username')
      .eq('is_active', true);

    const profilesByClient = new Map<string, SocialProfileRow[]>();
    for (const p of (socialProfiles ?? []) as SocialProfileRow[]) {
      const arr = profilesByClient.get(p.client_id) ?? [];
      arr.push(p);
      profilesByClient.set(p.client_id, arr);
    }

    const strategyByClient = new Map<string, StrategyRow>();
    if (allClients.length > 0) {
      const { data: strategies } = await admin
        .from('client_strategies')
        .select('client_id, executive_summary, content_pillars')
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      for (const s of (strategies ?? []) as StrategyRow[]) {
        if (!strategyByClient.has(s.client_id)) {
          strategyByClient.set(s.client_id, s);
        }
      }
    }

    // Load team members for context
    const { data: teamMembers } = await admin
      .from('team_members')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name');

    const clientSummaries = allClients.map((c) =>
      buildClientSummary(c, profilesByClient.get(c.id) ?? [], strategyByClient.get(c.id) ?? null),
    );

    // Enrich mentioned clients with knowledge context
    const mentionedClientIds = new Set(
      (mentions ?? []).filter((m) => m.type === 'client').map((m) => m.id),
    );
    const knowledgeSummaries = await Promise.all(
      allClients
        .filter((c) => mentionedClientIds.has(c.id))
        .map(async (c) => ({ id: c.id, summary: await buildKnowledgeSummary(c.id) })),
    );
    const knowledgeByClient = new Map(knowledgeSummaries.map((k) => [k.id, k.summary]));

    const enrichedSummaries = allClients.map((c, i) => {
      const knowledge = knowledgeByClient.get(c.id);
      return knowledge ? `${clientSummaries[i]}\n${knowledge}` : clientSummaries[i];
    });

    const teamContext = (teamMembers ?? []).map((t) => `- ${t.full_name} (id: ${t.id}, role: ${t.role ?? 'team member'})`).join('\n');

    let portfolioContext = `# Nativz Client Portfolio (${allClients.length} active clients)\n\n${enrichedSummaries.join('\n\n---\n\n')}`;
    portfolioContext += `\n\n# Team Members\n${teamContext}`;

    // Add mention context if present
    if (mentions && mentions.length > 0) {
      const mentionContext = mentions.map((m) => {
        if (m.type === 'client') {
          return `@${m.name} → client_id: ${m.id}, slug: ${m.slug ?? ''}`;
        }
        return `@${m.name} → team_member_id: ${m.id}`;
      }).join('\n');
      portfolioContext += `\n\n# @Mentions in current message\n${mentionContext}`;
    }

    // --- Build API messages ---
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenRouter API key not configured' }), { status: 500 });
    }

    const apiMessages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: portfolioContext },
      ...messages.map((m) => {
        if (m.role === 'tool' && m.tool_call_id) {
          return { role: 'tool' as const, content: m.content, tool_call_id: m.tool_call_id };
        }
        return { role: m.role, content: m.content };
      }),
    ];

    const tools = getToolsForAPI();
    const allToolDefs = getAllTools();

    // --- Initial API call with tool definitions ---
    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io',
        'X-Title': 'Nativz Cortex - The Nerd',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-5',
        messages: apiMessages,
        stream: true,
        max_tokens: 8192,
        tools: tools.length > 0 ? tools : undefined,
      }),
    });

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      console.error('OpenRouter error:', errText);
      return new Response(JSON.stringify({ error: 'AI service error' }), { status: 502 });
    }

    // --- Stream response, handling tool calls ---
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let currentMessages = [...apiMessages];
        let response = openRouterRes;
        let toolCallCount = 0;
        const MAX_TOOL_CALLS = 5;

        async function processStream(res: Response): Promise<{
          textContent: string;
          toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>;
        }> {
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let textContent = '';
          const toolCalls: Array<{ id: string; index: number; function: { name: string; arguments: string } }> = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);
              if (data === '[DONE]') continue;

              try {
                const chunk = JSON.parse(data);
                const delta = chunk.choices?.[0]?.delta;
                if (!delta) continue;

                // Text content
                if (delta.content) {
                  textContent += delta.content;
                  controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', content: delta.content }) + '\n'));
                }

                // Tool calls
                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolCalls[idx]) {
                      toolCalls[idx] = { id: tc.id || '', index: idx, function: { name: '', arguments: '' } };
                    }
                    if (tc.id) toolCalls[idx].id = tc.id;
                    if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }
              } catch {
                // skip malformed chunks
              }
            }
          }

          return { textContent, toolCalls };
        }

        try {
          while (toolCallCount < MAX_TOOL_CALLS) {
            const { textContent, toolCalls } = await processStream(response);

            // No tool calls — we're done
            if (toolCalls.length === 0) break;

            toolCallCount += toolCalls.length;

            // Build assistant message with tool calls
            const assistantMsg: Record<string, unknown> = {
              role: 'assistant',
              content: textContent || null,
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.function.name, arguments: tc.function.arguments },
              })),
            };
            currentMessages.push(assistantMsg as typeof currentMessages[0]);

            // Execute each tool call
            for (const tc of toolCalls) {
              const toolName = tc.function.name;
              const toolDef = allToolDefs.find((t) => t.name === toolName);

              let result: ToolResult;

              if (!toolDef) {
                result = { success: false, error: `Unknown tool: ${toolName}` };
              } else {
                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(tc.function.arguments || '{}');
                } catch {
                  result = { success: false, error: 'Invalid tool arguments' };
                  // Send error result
                  controller.enqueue(encoder.encode(JSON.stringify({
                    type: 'tool_result',
                    toolCallId: tc.id,
                    toolName,
                    result,
                  }) + '\n'));
                  currentMessages.push({
                    role: 'tool',
                    content: JSON.stringify(result),
                    tool_call_id: tc.id,
                  } as typeof currentMessages[0]);
                  continue;
                }

                // Check risk level
                if (toolDef.riskLevel === 'write') {
                  // Send confirmation request to frontend
                  controller.enqueue(encoder.encode(JSON.stringify({
                    type: 'action_confirmation',
                    toolCallId: tc.id,
                    toolName,
                    arguments: args,
                    riskLevel: toolDef.riskLevel,
                    description: toolDef.description,
                  }) + '\n'));

                  // For write actions, execute directly (frontend will handle UX)
                  // The confirmation UX is handled client-side
                  result = await toolDef.handler(args, user.id);
                } else if (toolDef.riskLevel === 'destructive') {
                  result = {
                    success: false,
                    error: `This action must be performed manually for safety.`,
                    link: { href: '/admin', label: 'Go to admin' },
                  };
                } else {
                  // Read — auto execute
                  result = await toolDef.handler(args, user.id);
                }
              }

              // Send tool result to frontend
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'tool_result',
                toolCallId: tc.id,
                toolName,
                result,
              }) + '\n'));

              // Add tool result to conversation for next API call
              currentMessages.push({
                role: 'tool',
                content: JSON.stringify(result),
                tool_call_id: tc.id,
              } as typeof currentMessages[0]);
            }

            // Continue conversation with tool results
            const continueRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io',
                'X-Title': 'Nativz Cortex - The Nerd',
              },
              body: JSON.stringify({
                model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-5',
                messages: currentMessages,
                stream: true,
                max_tokens: 8192,
                tools: tools.length > 0 ? tools : undefined,
              }),
            });

            if (!continueRes.ok) {
              const errText = await continueRes.text();
              console.error('OpenRouter continue error:', errText);
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', content: '\n\nI encountered an error processing the tool results. Please try again.' }) + '\n'));
              break;
            }

            response = continueRes;
          }
        } catch (err) {
          console.error('Stream error:', err);
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', content: '\n\nConnection lost. Please try again.' }) + '\n'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Nerd chat error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
