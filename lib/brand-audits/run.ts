import { createCompletion } from '@/lib/ai/client';
import type {
  BrandAuditModelRollup,
  BrandAuditResponse,
  BrandAuditSentimentBreakdown,
  BrandAuditSourceRollup,
} from './types';
import { DEFAULT_AUDIT_MODELS, DEFAULT_PROMPT_TEMPLATES } from './types';

export interface RunBrandAuditInput {
  brandName: string;
  category: string | null;
  prompts?: string[];
  models?: string[];
  userId?: string;
  userEmail?: string;
}

export interface RunBrandAuditResult {
  prompts: string[];
  models: string[];
  responses: BrandAuditResponse[];
  visibility_score: number;
  sentiment_score: number | null;
  sentiment_breakdown: BrandAuditSentimentBreakdown;
  top_sources: BrandAuditSourceRollup[];
  model_summary: BrandAuditModelRollup[];
}

/** Build the default prompt set when caller doesn't provide custom prompts. */
export function buildDefaultPrompts(brandName: string, category: string | null): string[] {
  const categorySuffix = category ? ` in ${category}` : '';
  return DEFAULT_PROMPT_TEMPLATES.map((tpl) =>
    tpl
      .replaceAll('{{brand}}', brandName)
      .replaceAll('{{categorySuffix}}', categorySuffix),
  );
}

/** Case-insensitive substring detection. Returns the index of the first match
 *  or -1. Trims whitespace and strips a leading `@` so we match `nativz` and
 *  `@nativz` from the same haystack. */
function findBrandPosition(text: string, brandName: string): number {
  if (!text || !brandName) return -1;
  const needle = brandName.trim().replace(/^@+/, '').toLowerCase();
  if (!needle) return -1;
  return text.toLowerCase().indexOf(needle);
}

const SENTIMENT_TO_NUMERIC: Record<BrandAuditResponse['sentiment'], number | null> = {
  positive: 1,
  neutral: 0,
  negative: -1,
  not_mentioned: null,
};

/** Classify sentiment for a mentioned brand using the configured model.
 *  Falls back to 'neutral' on any parsing failure — better to under-claim
 *  than to fabricate. */
async function classifySentiment(args: {
  brandName: string;
  prompt: string;
  response: string;
  feature: string;
  userId?: string;
  userEmail?: string;
}): Promise<{ sentiment: BrandAuditResponse['sentiment']; summary: string; cost: number }> {
  const { brandName, prompt, response, feature, userId, userEmail } = args;

  const systemPrompt =
    'You classify sentiment toward a specific brand inside an AI-generated response. ' +
    'Reply with JSON only — no commentary.';

  const userPrompt = [
    `Brand to evaluate: ${brandName}`,
    '',
    `Question that was asked:`,
    prompt,
    '',
    `AI's response:`,
    response,
    '',
    `Return JSON in this exact shape:`,
    `{ "sentiment": "positive" | "neutral" | "negative" | "not_mentioned", "summary": "<one short sentence>" }`,
    `Use "not_mentioned" if the brand is not referenced by name. "Summary" should be one concise sentence describing how the response talks about the brand.`,
  ].join('\n');

  try {
    const result = await createCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 200,
      jsonMode: true,
      feature,
      userId,
      userEmail,
    });

    const parsed = JSON.parse(result.text) as {
      sentiment?: string;
      summary?: string;
    };

    const sentiment: BrandAuditResponse['sentiment'] =
      parsed.sentiment === 'positive' ||
      parsed.sentiment === 'neutral' ||
      parsed.sentiment === 'negative' ||
      parsed.sentiment === 'not_mentioned'
        ? parsed.sentiment
        : 'neutral';

    return {
      sentiment,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      cost: result.estimatedCost,
    };
  } catch (err) {
    console.error('[brand-audit] sentiment classification failed:', err);
    return { sentiment: 'neutral', summary: '', cost: 0 };
  }
}

/** Run one prompt × model combination. Captures errors per-cell so a single
 *  flaky model doesn't tank the whole audit. */
async function runOneCell(args: {
  prompt: string;
  model: string;
  brandName: string;
  feature: string;
  userId?: string;
  userEmail?: string;
}): Promise<BrandAuditResponse> {
  const { prompt, model, brandName, feature, userId, userEmail } = args;

  try {
    const result = await createCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You are a knowledgeable assistant. Answer the user concisely and cite reputable sources when possible.',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 600,
      webSearch: true,
      webSearchMaxResults: 6,
      modelPreference: [model],
      feature,
      userId,
      userEmail,
      timeoutMs: 90_000,
    });

    const text = result.text;
    const position = findBrandPosition(text, brandName);
    const mentioned = position >= 0;

    let sentiment: BrandAuditResponse['sentiment'] = 'not_mentioned';
    let summary = '';
    let sentimentCost = 0;
    if (mentioned) {
      const classification = await classifySentiment({
        brandName,
        prompt,
        response: text,
        feature: 'brand_audit_sentiment',
        userId,
        userEmail,
      });
      sentiment = classification.sentiment === 'not_mentioned' ? 'neutral' : classification.sentiment;
      summary = classification.summary;
      sentimentCost = classification.cost;
    }

    const sources: { url: string; title: string }[] = (result.webCitations ?? []).map((c) => ({
      url: c.url,
      title: c.title || c.url,
    }));

    return {
      prompt,
      model: result.modelUsed || model,
      text,
      mentioned,
      sentiment,
      summary,
      sources,
      position: mentioned ? position : null,
      cost: result.estimatedCost + sentimentCost,
      error: null,
    };
  } catch (err) {
    return {
      prompt,
      model,
      text: '',
      mentioned: false,
      sentiment: 'not_mentioned',
      summary: '',
      sources: [],
      position: null,
      cost: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function aggregate(responses: BrandAuditResponse[], models: string[]): {
  visibility_score: number;
  sentiment_score: number | null;
  sentiment_breakdown: BrandAuditSentimentBreakdown;
  top_sources: BrandAuditSourceRollup[];
  model_summary: BrandAuditModelRollup[];
} {
  const total = responses.length;
  const usable = responses.filter((r) => !r.error);
  const visibility = usable.length === 0
    ? 0
    : (usable.filter((r) => r.mentioned).length / usable.length) * 100;

  const breakdown: BrandAuditSentimentBreakdown = {
    positive: 0,
    neutral: 0,
    negative: 0,
    not_mentioned: 0,
  };

  let sentimentSum = 0;
  let sentimentCount = 0;
  for (const r of usable) {
    breakdown[r.sentiment]++;
    const numeric = SENTIMENT_TO_NUMERIC[r.sentiment];
    if (numeric !== null) {
      sentimentSum += numeric;
      sentimentCount++;
    }
  }
  const sentiment_score = sentimentCount === 0 ? null : sentimentSum / sentimentCount;

  // Top sources rollup — dedupe by URL, count occurrences.
  const sourceMap = new Map<string, BrandAuditSourceRollup>();
  for (const r of usable) {
    for (const src of r.sources) {
      const existing = sourceMap.get(src.url);
      if (existing) {
        existing.count++;
        if (!existing.title && src.title) existing.title = src.title;
      } else {
        sourceMap.set(src.url, { url: src.url, title: src.title, count: 1 });
      }
    }
  }
  const top_sources = Array.from(sourceMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Model rollup — every requested model gets a row even if all its calls
  // failed, so the UI can still surface the dead row instead of pretending
  // the model wasn't tried.
  const model_summary: BrandAuditModelRollup[] = models.map((model) => {
    const rows = responses.filter((r) => r.model === model || r.model.startsWith(model));
    const successful = rows.filter((r) => !r.error);
    const mentionedCount = successful.filter((r) => r.mentioned).length;
    const sentiments = successful
      .map((r) => SENTIMENT_TO_NUMERIC[r.sentiment])
      .filter((v): v is number => v !== null);
    const avg = sentiments.length === 0
      ? null
      : sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
    return {
      model,
      mentioned: mentionedCount,
      total: rows.length,
      sentiment_avg: avg,
    };
  });

  // Expose totals to satisfy the unused-var linter when the caller wants them.
  void total;

  return {
    visibility_score: visibility,
    sentiment_score,
    sentiment_breakdown: breakdown,
    top_sources,
    model_summary,
  };
}

/** Run a brand audit end-to-end. Caller is responsible for persistence. */
export async function runBrandAudit(input: RunBrandAuditInput): Promise<RunBrandAuditResult> {
  const { brandName, category, userId, userEmail } = input;
  const prompts = (input.prompts && input.prompts.length > 0)
    ? input.prompts
    : buildDefaultPrompts(brandName, category);
  const models = (input.models && input.models.length > 0)
    ? input.models
    : [...DEFAULT_AUDIT_MODELS];

  const cells: { prompt: string; model: string }[] = [];
  for (const p of prompts) for (const m of models) cells.push({ prompt: p, model: m });

  const responses = await Promise.all(
    cells.map((c) =>
      runOneCell({
        prompt: c.prompt,
        model: c.model,
        brandName,
        feature: 'brand_audit_run',
        userId,
        userEmail,
      }),
    ),
  );

  const rollup = aggregate(responses, models);

  return {
    prompts,
    models,
    responses,
    ...rollup,
  };
}
