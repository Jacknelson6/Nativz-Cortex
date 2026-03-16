import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const chatSchema = z.object({
  board_id: z.string(),
  item_ids: z.array(z.string()),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(1),
  note_contents: z.array(z.string()).optional(),
  client_slugs: z.array(z.string()).optional(),
  model: z.string().optional(),
});

const SYSTEM_PROMPT = `You are Cortex AI — a creative strategist and viral content expert embedded in Nativz Cortex, a moodboard tool for content creators and agencies.

You have deep context on the moodboard items including videos (transcripts, analysis, metadata, visual breakdowns) and websites (page insights, headlines, content themes). Use this context to:

- Analyze hooks, pacing, and content structure from videos
- Analyze website messaging, positioning, and content strategy
- Cross-reference video content with website messaging
- Suggest rescripts and adaptations for different brands/audiences
- Compare content styles across multiple pieces
- Identify winning elements and improvement areas
- Help craft new content inspired by what works
- Provide actionable creative strategy

Be direct, insightful, and creative. Speak like a senior creative strategist — not generic AI. Reference specific details from the content when possible. Keep responses focused and scannable with headers/bullets when appropriate.`;

function buildItemContext(item: Record<string, unknown>): string {
  const parts: string[] = [];
  const itemType = item.type as string;
  parts.push(`## ${item.title || 'Untitled'} (${itemType})`);

  if (itemType === 'website') {
    // Website-specific context
    if (item.url) parts.push(`URL: ${item.url}`);
    const insights = item.page_insights as Record<string, unknown> | null;
    if (insights) {
      if (insights.summary) parts.push(`Summary: ${insights.summary}`);
      const headlines = insights.key_headlines as string[] | null;
      if (headlines?.length) parts.push(`Key Headlines:\n${headlines.map(h => `  - ${h}`).join('\n')}`);
      const valueProps = insights.value_propositions as string[] | null;
      if (valueProps?.length) parts.push(`Value Propositions:\n${valueProps.map(v => `  - ${v}`).join('\n')}`);
      if (insights.design_notes) parts.push(`Design Notes: ${insights.design_notes}`);
      const notable = insights.notable_insights as string[] | null;
      if (notable?.length) parts.push(`Notable Insights:\n${notable.map(n => `  - ${n}`).join('\n')}`);
      const themes = insights.content_themes as string[] | null;
      if (themes?.length) parts.push(`Content Themes: ${themes.join(', ')}`);
    }
    return parts.join('\n');
  }

  // Video/image context
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

/**
 * POST /api/analysis/chat
 *
 * Stream AI creative strategy chat grounded in selected moodboard content.
 * Fetches item analysis data (transcripts, hooks, pacing, insights) and
 * optionally client brand context (via @mention slugs) and sticky note text.
 * Returns a streaming text/plain response via Server-Sent Events using the
 * Cortex AI persona backed by Claude Sonnet via OpenRouter.
 *
 * @auth Required (any authenticated user)
 * @body board_id - Board UUID (required)
 * @body item_ids - Array of item UUIDs to include as context (required, may be empty)
 * @body messages - Conversation history [{role, content}] — at least 1 message (required)
 * @body note_contents - Sticky note text strings to include as context (optional)
 * @body client_slugs - Client slugs to inject brand context via @ mentions (optional)
 * @body model - OpenRouter model override (optional, default 'anthropic/claude-sonnet-4')
 * @returns {ReadableStream<string>} Streamed AI text response
 */
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

    const { board_id, item_ids, messages, note_contents, client_slugs, model } = parsed.data;
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

    // Fetch items (allow empty — context may come from notes or clients)
    let items: Record<string, unknown>[] = [];
    if (item_ids.length > 0) {
      const { data } = await adminClient
        .from('moodboard_items')
        .select('*')
        .in('id', item_ids)
        .eq('board_id', board_id);
      items = data ?? [];
    }

    // Fetch client data if @mentioned
    let clientContexts = '';
    if (client_slugs?.length) {
      const { data: clientRows } = await adminClient
        .from('clients')
        .select('id, name, slug, industry, description, target_audience, brand_voice, topic_keywords, preferences')
        .in('slug', client_slugs);

      if (clientRows?.length) {
        // Also fetch latest strategy for each client
        for (const client of clientRows) {
          const parts: string[] = [];
          parts.push(`## Client: ${client.name}`);
          if (client.industry) parts.push(`Industry: ${client.industry}`);
          if (client.description) parts.push(`Description: ${client.description}`);
          if (client.target_audience) parts.push(`Target Audience: ${client.target_audience}`);
          if (client.brand_voice) parts.push(`Brand Voice: ${client.brand_voice}`);
          if (client.topic_keywords?.length) parts.push(`Key Topics: ${client.topic_keywords.join(', ')}`);
          const prefs = client.preferences as Record<string, unknown> | null;
          if (prefs) {
            if ((prefs.tone_keywords as string[])?.length) parts.push(`Tone: ${(prefs.tone_keywords as string[]).join(', ')}`);
            if ((prefs.topics_lean_into as string[])?.length) parts.push(`Topics to Lean Into: ${(prefs.topics_lean_into as string[]).join(', ')}`);
            if ((prefs.topics_avoid as string[])?.length) parts.push(`Topics to Avoid: ${(prefs.topics_avoid as string[]).join(', ')}`);
          }

          // Get latest strategy
          const { data: strategy } = await adminClient
            .from('client_strategies')
            .select('executive_summary, content_pillars')
            .eq('client_id', client.id)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (strategy?.executive_summary) parts.push(`\nStrategy Summary:\n${strategy.executive_summary}`);
          if (strategy?.content_pillars) {
            const pillars = strategy.content_pillars as Array<{ name: string; description?: string }>;
            if (pillars.length) parts.push(`Content Pillars: ${pillars.map(p => p.name).join(', ')}`);
          }

          // Fetch brand profile from knowledge system
          const { getBrandProfile } = await import('@/lib/knowledge/queries');
          const brandProfile = await getBrandProfile(client.id);
          if (brandProfile) {
            parts.push(`\nBrand Profile:\n${brandProfile.content.substring(0, 2000)}`);
          }

          clientContexts += '\n\n---\n\n' + parts.join('\n');
        }
      }
    }

    if (!items.length && !note_contents?.length && !clientContexts) {
      return new Response(JSON.stringify({ error: 'No content to discuss' }), { status: 400 });
    }

    // Build context
    const contextParts: string[] = [];
    if (items.length > 0) {
      const itemContexts = items.map(buildItemContext).join('\n\n---\n\n');
      contextParts.push(`Here are the moodboard items:\n\n${itemContexts}`);
    }
    if (note_contents?.length) {
      contextParts.push(`\n\nSticky notes on the board:\n${note_contents.map((n, i) => `- Note ${i + 1}: ${n}`).join('\n')}`);
    }
    if (clientContexts) {
      contextParts.push(`\n\nClient context (mentioned with @):${clientContexts}`);
    }
    const contextMessage = contextParts.join('\n');

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
        model: model || 'openrouter/hunter-alpha',
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
