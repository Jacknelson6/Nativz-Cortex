import { createCompletion } from '@/lib/ai/client';

export type RefineSerpQueryResult = {
  query: string;
  tokens: number;
  cost: number;
};

/**
 * Optional “general” LLM pass before SERP: one concise web search query from topic + subtopic + recency.
 * Uses `modelPreference` from refineModel when set, else researchModel (same routing as research: OpenAI first when id maps to OpenAI).
 */
export async function refineSerpQueryWithLlm(args: {
  parentQuery: string;
  subtopic: string;
  timeRangeLabel: string;
  userId: string;
  userEmail?: string;
  researchModel: string;
  refineModel?: string;
}): Promise<RefineSerpQueryResult> {
  const fallback = `${args.parentQuery} — ${args.subtopic}`;
  const modelPref = args.refineModel?.trim() || args.researchModel;

  const prompt = `You help build a single web search query. Output ONE line only: a concise search string (no quotes, no bullets) to find relevant pages, discussions, and news about the subtopic in the context of the main topic. Prefer wording that works well in a search engine. The user cares about sources from: ${args.timeRangeLabel}.

Main topic: ${args.parentQuery}
Subtopic angle: ${args.subtopic}

Search query:`;

  try {
    const ai = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
      feature: 'topic_search',
      userId: args.userId,
      userEmail: args.userEmail,
      modelPreference: [modelPref],
    });
    const line =
      ai.text
        .trim()
        .split('\n')
        .map((s) => s.trim())
        .find((s) => s.length > 0) ?? '';
    const cleaned = line.replace(/^["']|["']$/g, '').slice(0, 500);
    const query = cleaned.length >= 8 ? cleaned : fallback;
    return {
      query,
      tokens: ai.usage.totalTokens,
      cost: ai.estimatedCost,
    };
  } catch {
    return { query: fallback, tokens: 0, cost: 0 };
  }
}
