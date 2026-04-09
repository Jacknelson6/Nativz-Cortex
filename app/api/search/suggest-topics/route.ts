import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { z } from 'zod';

export const maxDuration = 30;

const Schema = z.object({
  client_id: z.string().uuid(),
});

/**
 * POST /api/search/suggest-topics — AI-generated topic suggestions based on client brand data
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Fetch client brand data
    const { data: client } = await adminClient
      .from('clients')
      .select('name, industry, brand_voice, topic_keywords, target_audience')
      .eq('id', parsed.data.client_id)
      .single();

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Fetch recent successful searches for this client to avoid repeats
    const { data: recentSearches } = await adminClient
      .from('topic_searches')
      .select('query')
      .eq('client_id', parsed.data.client_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10);

    const recentTopics = (recentSearches ?? []).map(s => s.query);

    // Fetch knowledge base entries for richer context
    const { data: knowledgeEntries } = await adminClient
      .from('knowledge_nodes')
      .select('title, content')
      .eq('client_id', parsed.data.client_id)
      .order('created_at', { ascending: false })
      .limit(5);

    const knowledgeContext = (knowledgeEntries ?? [])
      .map(e => `- ${e.title}: ${(e.content ?? '').substring(0, 150)}`)
      .join('\n');

    const prompt = `You are a topic researcher for a marketing agency. Suggest 6 research topics for this brand. These will be typed into a trend research tool that searches TikTok, YouTube, Instagram, Reddit, and the web.

BRAND:
- Name: ${client.name}
- Industry: ${client.industry ?? 'unknown'}
- Brand voice: ${client.brand_voice ?? 'unknown'}
- Target audience: ${client.target_audience ?? 'unknown'}
- Topic keywords: ${(client.topic_keywords ?? []).join(', ') || 'none'}

${knowledgeContext ? `BRAND KNOWLEDGE:\n${knowledgeContext}\n` : ''}
${recentTopics.length > 0 ? `ALREADY RESEARCHED (do NOT repeat):\n${recentTopics.map(t => `- ${t}`).join('\n')}\n` : ''}

Each topic should be:
- A subject or ontology the brand operates in (1-4 words)
- Specific to what ${client.name} does, but not a content format or filming style
- Something their audience cares about or searches for
- Different from already-researched topics

BAD (too broad): "marketing", "social media", "business tips"
BAD (too specific/format-oriented): "day in the life moving crew", "satisfying before after cleanout"
GOOD (topic/ontology level): "junk removal", "home moving", "spendable gold currency", "estate cleanout services", "franchise ownership"

Return ONLY a JSON array of strings: ["topic 1", "topic 2", ...]`;

    const result = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 500,
      feature: 'suggest_topics',
      jsonMode: true,
    });

    try {
      const suggestions = parseAIResponseJSON<string[]>(result.text);
      if (!Array.isArray(suggestions)) {
        return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
      }
      return NextResponse.json({ suggestions: suggestions.slice(0, 6) });
    } catch {
      return NextResponse.json({ error: 'Failed to parse suggestions' }, { status: 500 });
    }
  } catch (error) {
    console.error('POST /api/search/suggest-topics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
