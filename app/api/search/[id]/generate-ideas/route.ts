import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { VideoIdea, TopicSearchAIResponse, TrendingTopic } from '@/lib/types/search';

export const maxDuration = 120;

/**
 * Match UI topic name to stored topic (trim + case-insensitive; then loose substring).
 * Strict equality failed when models or copy edits introduced invisible whitespace drift.
 */
function findTopicIndex(topics: TrendingTopic[], topicName: string): number {
  const want = topicName.trim().toLowerCase();
  const exact = topics.findIndex((t) => t.name.trim().toLowerCase() === want);
  if (exact >= 0) return exact;
  return topics.findIndex(
    (t) => {
      const n = t.name.trim().toLowerCase();
      return n.includes(want) || want.includes(n);
    },
  );
}

/**
 * Parse `{ "ideas": [...] }` from model output; fall back to array slice if JSON is noisy.
 */
function parseIdeasFromCompletion(text: string): VideoIdea[] {
  try {
    const parsed = parseAIResponseJSON<{ ideas: VideoIdea[] }>(text);
    return parsed.ideas ?? [];
  } catch {
    const key = '"ideas"';
    const idx = text.indexOf(key);
    if (idx === -1) return [];
    const bracket = text.indexOf('[', idx);
    if (bracket === -1) return [];
    let depth = 0;
    let end = -1;
    for (let i = bracket; i < text.length; i++) {
      const c = text[i];
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) return [];
    try {
      const arr = JSON.parse(text.slice(bracket, end + 1)) as unknown[];
      return arr.filter((x): x is VideoIdea =>
        Boolean(x && typeof x === 'object' && 'title' in x && typeof (x as VideoIdea).title === 'string'),
      );
    } catch {
      return [];
    }
  }
}

const requestSchema = z.object({
  topic_name: z.string().min(1),
  existing_ideas: z.array(z.string()).default([]),
});

/**
 * POST /api/search/[id]/generate-ideas
 *
 * Generate 4 additional video ideas for a specific trending topic within a search.
 * Avoids duplicating any existing ideas provided in the request. Appends the new ideas
 * to the search's raw_ai_response for the matching topic.
 *
 * @auth Required (any authenticated user)
 * @param id - Topic search UUID
 * @body topic_name - Name of the trending topic to generate ideas for (required)
 * @body existing_ideas - Array of existing idea titles to avoid repeating (default: [])
 * @returns {{ ideas: VideoIdea[] }} 4 new video ideas
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }

    const { topic_name, existing_ideas } = parsed.data;

    // Fetch the search to get context
    const adminClient = createAdminClient();
    const { data: search } = await adminClient
      .from('topic_searches')
      .select('query, client_id, raw_ai_response')
      .eq('id', id)
      .single();

    if (!search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    const aiResponse = search.raw_ai_response as TopicSearchAIResponse | null;
    const topics = aiResponse?.trending_topics ?? [];
    if (!aiResponse || topics.length === 0) {
      return NextResponse.json(
        { error: 'This search has no topic analysis yet. Use a completed search with trending topics.' },
        { status: 400 },
      );
    }
    const topicIndex = findTopicIndex(topics, topic_name);
    if (topicIndex < 0) {
      return NextResponse.json(
        {
          error: 'Topic not found for this search',
          topic_name,
          available_topics: topics.map((t) => t.name),
        },
        { status: 404 },
      );
    }

    // Get client context if available — include product/service details for natural integration
    let clientBlock = '';
    if (search.client_id) {
      const { data: client } = await adminClient
        .from('clients')
        .select('name, industry, brand_voice, target_audience, website_url, topic_keywords, preferences')
        .eq('id', search.client_id)
        .single();
      if (client) {
        const prefs = client.preferences as Record<string, unknown> | null;
        const lines = [
          `Brand: ${client.name}`,
          `Industry: ${client.industry}`,
          client.target_audience ? `Target audience: ${client.target_audience}` : null,
          client.brand_voice ? `Brand voice: ${client.brand_voice}` : null,
          client.website_url ? `Website: ${client.website_url}` : null,
          client.topic_keywords?.length ? `Core topics: ${client.topic_keywords.join(', ')}` : null,
          prefs?.['topics_lean_into'] ? `Lean into: ${(prefs['topics_lean_into'] as string[]).join(', ')}` : null,
          prefs?.['topics_avoid'] ? `Avoid: ${(prefs['topics_avoid'] as string[]).join(', ')}` : null,
        ].filter(Boolean);
        clientBlock = `\n\nCLIENT CONTEXT:\n${lines.join('\n')}\n\nNaturally weave in the client's brand name, products, location, and industry where it fits — but only when it feels organic. Don't force brand mentions into every idea.`;
      }
    }

    const existingList = existing_ideas.length > 0
      ? `\n\nEXISTING IDEAS (do NOT repeat these):\n${existing_ideas.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
      : '';

    const canonicalTopicName = topics[topicIndex]!.name;
    const prompt = `Generate 4 new short-form video ideas for the topic "${canonicalTopicName}" from the research query "${search.query}".${clientBlock}

These should be for TikTok, Instagram Reels, YouTube Shorts, and Facebook Reels ONLY. Each idea must be unique, actionable, and ready to produce on set.${existingList}

Respond ONLY in valid JSON matching this exact schema:
{
  "ideas": [
    {
      "title": "Compelling video title",
      "hook": "The first 3 seconds — what grabs attention",
      "format": "talking_head | tutorial | reaction | street_interview | before_after | myth_bust | day_in_the_life | ugc_style | pov | storytime | hot_take | listicle",
      "virality": "low | medium | high | viral_potential",
      "why_it_works": "1-2 sentences explaining why this performs well",
      "script_outline": ["Hook (1-3 sec)", "Point 1", "Point 2", "Point 3", "CTA"],
      "cta": "Suggested call-to-action"
    }
  ]
}

Generate exactly 4 ideas. Make them DIFFERENT from the existing ideas — new angles, new hooks, new formats.`;

    const aiResult = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4000,
      feature: 'topic_search',
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    const newIdeas = parseIdeasFromCompletion(aiResult.text);

    // Append new ideas to the search's trending topic
    if (newIdeas.length > 0) {
      const updatedTopics = (aiResponse.trending_topics ?? []).map((topic, i) => {
        if (i !== topicIndex) return topic;
        return {
          ...topic,
          video_ideas: [...(topic.video_ideas ?? []), ...newIdeas],
        };
      });

      await adminClient
        .from('topic_searches')
        .update({
          raw_ai_response: { ...aiResponse, trending_topics: updatedTopics },
          trending_topics: updatedTopics,
        })
        .eq('id', id);
    }

    return NextResponse.json({ ideas: newIdeas });
  } catch (error) {
    console.error('POST /api/search/[id]/generate-ideas error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate ideas' },
      { status: 500 },
    );
  }
}
