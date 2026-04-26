/**
 * Shape of a single prompt × model response captured during a brand audit.
 * Stored in `brand_audits.responses` as a JSONB array.
 */
export interface BrandAuditResponse {
  prompt: string;
  model: string;
  text: string;
  mentioned: boolean;
  sentiment: 'positive' | 'neutral' | 'negative' | 'not_mentioned';
  /** One-sentence summary of how the model talks about the brand. */
  summary: string;
  sources: { url: string; title: string }[];
  /** Index of the brand name in the response (case-insensitive substring). */
  position: number | null;
  cost: number;
  error: string | null;
}

export interface BrandAuditSourceRollup {
  url: string;
  title: string;
  count: number;
}

export interface BrandAuditModelRollup {
  model: string;
  /** Count of prompts where the brand was mentioned, out of total prompts run. */
  mentioned: number;
  total: number;
  /** Mean sentiment across mentioned responses, mapped to [-1, 1]. Null when unmentioned everywhere. */
  sentiment_avg: number | null;
}

export interface BrandAuditSentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  not_mentioned: number;
}

export interface BrandAuditRow {
  id: string;
  attached_client_id: string | null;
  brand_name: string;
  category: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  prompts: string[];
  models: string[];
  responses: BrandAuditResponse[];
  visibility_score: number | null;
  sentiment_score: number | null;
  sentiment_breakdown: BrandAuditSentimentBreakdown;
  top_sources: BrandAuditSourceRollup[];
  model_summary: BrandAuditModelRollup[];
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export const DEFAULT_AUDIT_MODELS = [
  'anthropic/claude-sonnet-4.5',
  'openai/gpt-5.4-mini',
  'google/gemini-2.5-flash',
] as const;

/** Default prompt set when the caller doesn't provide one. Each prompt gets
 *  the brand name interpolated via `{{brand}}` and (optionally) `{{category}}`. */
export const DEFAULT_PROMPT_TEMPLATES = [
  'Tell me about {{brand}}. What do they do and what are they known for?',
  'What are people saying about {{brand}}? Give me an honest read.',
  'Is {{brand}} a trusted, reputable choice{{categorySuffix}}?',
] as const;
