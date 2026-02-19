export interface AICompletionResponse {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  estimatedCost: number;
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CompletionOptions {
  messages: OpenRouterMessage[];
  maxTokens: number;
  webSearch?: boolean;
  webSearchMaxResults?: number;
}

// Pricing for anthropic/claude-sonnet-4.5 (per token)
const PRICE_PER_INPUT_TOKEN = 0.003 / 1000;
const PRICE_PER_OUTPUT_TOKEN = 0.015 / 1000;

export async function createCompletion(options: CompletionOptions): Promise<AICompletionResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-5';

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens,
    messages: options.messages,
  };

  if (options.webSearch) {
    body.plugins = [{
      id: 'web',
      max_results: options.webSearchMaxResults ?? 10,
    }];
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Nativz Cortex',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('OpenRouter API error:', response.status, errorBody.substring(0, 500));
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody.substring(0, 300)}`);
  }

  const data = await response.json();

  if (!data.choices || data.choices.length === 0) {
    console.error('OpenRouter returned no choices:', JSON.stringify(data).substring(0, 500));
    throw new Error('AI model returned no response. It may be overloaded. Try again.');
  }

  const content = data.choices[0]?.message?.content || '';

  if (!content) {
    console.error('OpenRouter returned empty content:', JSON.stringify(data.choices[0]).substring(0, 500));
    throw new Error('AI model returned an empty response. Try again.');
  }
  const promptTokens = data.usage?.prompt_tokens || 0;
  const completionTokens = data.usage?.completion_tokens || 0;

  return {
    text: content,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    estimatedCost: (
      promptTokens * PRICE_PER_INPUT_TOKEN +
      completionTokens * PRICE_PER_OUTPUT_TOKEN
    ),
  };
}
