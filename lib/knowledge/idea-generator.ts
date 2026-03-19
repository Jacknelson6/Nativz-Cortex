import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { getKnowledgeEntries, getBrandProfile } from '@/lib/knowledge/queries';
import { getBrandContext } from '@/lib/knowledge/brand-context';

export interface GeneratedIdea {
  title: string;
  description: string;
  hook: string;
  content_pillar: string;
}

export async function generateVideoIdeas(config: {
  clientId: string;
  concept?: string;
  count: number;
}): Promise<GeneratedIdea[]> {
  const { clientId, concept, count } = config;
  const admin = createAdminClient();

  // Parallel fetch all context
  const [
    brandProfile,
    clientRecord,
    topicSearches,
    contentLogs,
    latestStrategy,
    savedIdeas,
  ] = await Promise.all([
    getBrandProfile(clientId),
    admin
      .from('clients')
      .select('name, industry, target_audience, brand_voice, topic_keywords, preferences')
      .eq('id', clientId)
      .maybeSingle()
      .then(({ data }) => data),
    admin
      .from('topic_searches')
      .select('query, summary, trending_topics')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => data ?? []),
    admin
      .from('content_logs')
      .select('title, content_type, platform, performance_notes')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(15)
      .then(({ data }) => data ?? []),
    admin
      .from('client_strategies')
      .select('content_pillars, executive_summary')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => data),
    getKnowledgeEntries(clientId, 'idea'),
  ]);

  // Build context blocks
  const contextBlocks: string[] = [];

  // Try Brand DNA first — unified brand context takes precedence
  let hasBrandDNA = false;
  try {
    const brandDNA = await getBrandContext(clientId);
    if (brandDNA.fromGuideline) {
      contextBlocks.push(brandDNA.toPromptBlock());
      hasBrandDNA = true;
    }
  } catch {
    // Non-blocking — fall back to legacy context assembly
  }

  // Legacy fallback: assemble from client fields + brand profile
  if (!hasBrandDNA) {
    if (clientRecord) {
      contextBlocks.push(
        `<brand>
Name: ${clientRecord.name ?? ''}
Industry: ${clientRecord.industry ?? ''}
Target audience: ${clientRecord.target_audience ?? ''}
Brand voice: ${clientRecord.brand_voice ?? ''}
Topic keywords: ${Array.isArray(clientRecord.topic_keywords) ? (clientRecord.topic_keywords as string[]).join(', ') : clientRecord.topic_keywords ?? ''}
Preferences: ${clientRecord.preferences ? JSON.stringify(clientRecord.preferences) : 'none'}
</brand>`
      );
    }

    if (brandProfile) {
      contextBlocks.push(
        `<brand_profile>
${brandProfile.content ?? ''}
</brand_profile>`
      );
    }
  }

  // Structured entities from knowledge base
  const allEntries = await getKnowledgeEntries(clientId);
  const entityProducts = new Set<string>();
  const entityFaqs: string[] = [];
  const meetingTopics: string[] = [];

  for (const entry of allEntries) {
    const meta = entry.metadata as Record<string, unknown> | null;
    const entities = meta?.entities as {
      products?: { name: string; description?: string }[];
      faqs?: { question: string; answer: string }[];
    } | undefined;
    if (entities) {
      for (const p of entities.products ?? []) entityProducts.add(p.description ? `${p.name}: ${p.description}` : p.name);
      for (const f of entities.faqs ?? []) entityFaqs.push(`Q: ${f.question}`);
    }
    if (entry.type === 'meeting_note') {
      const actions = (meta?.action_items as string[]) ?? [];
      meetingTopics.push(`Meeting "${entry.title}": ${actions.length > 0 ? actions.join('; ') : entry.content.substring(0, 150)}`);
    }
  }

  if (entityProducts.size > 0) {
    contextBlocks.push(`<products_and_services>\n${[...entityProducts].join('\n')}\n</products_and_services>`);
  }
  if (entityFaqs.length > 0) {
    contextBlocks.push(`<common_questions>\n${entityFaqs.slice(0, 10).join('\n')}\n</common_questions>`);
  }
  if (meetingTopics.length > 0) {
    contextBlocks.push(`<meeting_insights>\n${meetingTopics.slice(0, 5).join('\n')}\n</meeting_insights>`);
  }

  if (latestStrategy) {
    contextBlocks.push(
      `<strategy>
Content pillars: ${latestStrategy.content_pillars ? JSON.stringify(latestStrategy.content_pillars) : 'none'}
Executive summary: ${(latestStrategy.executive_summary as string) ?? ''}
</strategy>`
    );
  }

  if (topicSearches.length > 0) {
    const searchSummaries = topicSearches.map((s) => {
      const trending = Array.isArray(s.trending_topics)
        ? (s.trending_topics as string[]).join(', ')
        : s.trending_topics ?? '';
      return `- Query: ${s.query ?? ''}\n  Summary: ${(s.summary as string) ?? ''}\n  Trending: ${trending}`;
    }).join('\n');
    contextBlocks.push(
      `<past_research>
${searchSummaries}
</past_research>`
    );
  }

  if (contentLogs.length > 0) {
    const logSummaries = contentLogs.map((l) =>
      `- ${l.title ?? 'Untitled'} (${l.content_type ?? ''}, ${l.platform ?? ''}): ${l.performance_notes ?? 'no notes'}`
    ).join('\n');
    contextBlocks.push(
      `<already_produced>
${logSummaries}
</already_produced>`
    );
  }

  if (savedIdeas.length > 0) {
    const ideaSummaries = savedIdeas.map((i) => `- ${i.title}`).join('\n');
    contextBlocks.push(
      `<saved_ideas_avoid_repeating>
${ideaSummaries}
</saved_ideas_avoid_repeating>`
    );
  }

  if (concept) {
    contextBlocks.push(
      `<concept_direction>
${concept}
</concept_direction>`
    );
  }

  const systemPrompt = `You are a creative video content strategist for a marketing agency. Generate exactly ${count} unique video ideas as a JSON array.

Each idea must have these fields:
- "title": a concise, compelling video title
- "description": 2-3 sentences explaining what the video covers and why it matters
- "hook": the opening line or visual that grabs attention in the first 3 seconds
- "content_pillar": the content category/pillar this falls under

Requirements:
- All ideas are short-form video content
- Ideas must be actionable for a videographer showing up on set
- Align with the brand voice and audience
- Do NOT repeat any existing saved ideas
- Each idea must be distinct from the others

Output ONLY the JSON array. No other text.`;

  const userPrompt = contextBlocks.join('\n\n');

  const result = await createCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 4000,
  });

  const ideas = parseAIResponseJSON<GeneratedIdea[]>(result.text);

  return ideas.slice(0, count);
}
