import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const chatSchema = z.object({
  board_id: z.string().uuid(),
  item_ids: z.array(z.string().uuid()).min(1),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(1),
  model: z.string().optional(),
});

const SYSTEM_PROMPT = `You are Cortex AI — a creative strategist and viral content expert embedded in Nativz Cortex, a moodboard tool for content creators and agencies.

You have deep context on the selected moodboard items (videos/images) including transcripts, analysis, metadata, and visual breakdowns. Use this context to:

- Analyze hooks, pacing, and content structure
- Suggest rescripts and adaptations for different brands/audiences
- Compare content styles across multiple pieces
- Identify winning elements and improvement areas
- Help craft new content inspired by what works
- Provide actionable creative strategy

Be direct, insightful, and creative. Speak like a senior creative strategist — not generic AI. Reference specific details from the content when possible. Keep responses focused and scannable with headers/bullets when appropriate.`;

function buildItemContext(item: Record<string, unknown>): string {
  const parts: string[] = [];
  parts.push(`## ${item.title || 'Untitled'} (${item.type})`);
  if (item.platform) parts.push(`Platform: ${item.platform}`);
  if (item.author_name) parts.push(`Creator: ${item.author_name} (@${item.author_handle || 'unknown'})`);
  if (item.url) parts.push(`URL: ${item.url}`);

  const stats = item.stats as Record<string, number> | null;
  if (stats) {
    parts.push(`Stats: ${stats.views?.toLocaleString() || '?'} views, ${stats.likes?.toLocaleString() || '?'} likes, ${stats.comments?.toLocaleString() || '?'} comments`);
  }
  if (item.duration) parts.push(`Duration: ${item.duration}s`);
  if (item.hook) parts.push(`Hook: "${item.hook}"`);
  if (item.hook_score != null) parts.push(`Hook Score: ${item.hook_score}/10`);
  if (item.hook_type) parts.push(`Hook Type: ${item.hook_type}`);
  if (item.hook_analysis) parts.push(`Hook Analysis: ${item.hook_analysis}`);
  if (item.concept_summary) parts.push(`Concept: ${item.concept_summary}`);
  if (item.cta) parts.push(`CTA: ${item.cta}`);

  const pacing = item.pacing as Record<string, unknown> | null;
  if (pacing) {
    parts.push(`Pacing: ${pacing.description} (${pacing.cuts_per_minute} cuts/min)`);
  }

  if (item.transcript) parts.push(`\nTranscript:\n${item.transcript}`);

  const themes = item.content_themes as string[] | null;
  if (themes?.length) parts.push(`Content Themes: ${themes.join(', ')}`);
  const winning = item.winning_elements as string[] | null;
  if (winning?.length) parts.push(`Winning Elements: ${winning.join(', ')}`);
  const improvements = item.improvement_areas as string[] | null;
  if (improvements?.length) parts.push(`Improvement Areas: ${improvements.join(', ')}`);

  const frames = item.frames as Array<Record<string, unknown>> | null;
  if (frames?.length) {
    parts.push(`\nVisual Breakdown (${frames.length} key frames):`);
    frames.forEach((f, i) => {
      parts.push(`  Frame ${i + 1} @${f.timestamp}s: ${f.description || 'No description'}`);
    });
  }

  return parts.join('\n');
}

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

    const { board_id, item_ids, messages, model } = parsed.data;
    const adminClient = createAdminClient();

    // Verify board access
    const { data: board } = await adminClient
      .from('moodboard_boards')
      .select('id, created_by')
      .eq('id', board_id)
      .single();

    if (!board) {
      return new Response(JSON.stringify({ error: 'Board not found' }), { status: 404 });
    }

    // Fetch items
    const { data: items } = await adminClient
      .from('moodboard_items')
      .select('*')
      .in('id', item_ids)
      .eq('board_id', board_id);

    if (!items?.length) {
      return new Response(JSON.stringify({ error: 'No items found' }), { status: 404 });
    }

    // Build context
    const itemContexts = items.map(buildItemContext).join('\n\n---\n\n');
    const contextMessage = `Here are the moodboard items the user wants to discuss:\n\n${itemContexts}`;

    const apiMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: contextMessage },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenRouter API key not configured' }), { status: 500 });
    }

    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://cortex.nativz.io',
        'X-Title': 'Nativz Cortex AI Chat',
      },
      body: JSON.stringify({
        model: model || 'anthropic/claude-sonnet-4',
        messages: apiMessages,
        stream: true,
        max_tokens: 4096,
      }),
    });

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      console.error('OpenRouter error:', errText);
      return new Response(JSON.stringify({ error: 'AI service error' }), { status: 502 });
    }

    // Stream the response
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = openRouterRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
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
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }
              } catch {
                // skip malformed chunks
              }
            }
          }
        } catch (err) {
          console.error('Stream error:', err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
