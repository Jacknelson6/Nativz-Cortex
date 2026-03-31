/**
 * Lightweight intent routing for client knowledge retrieval (no extra LLM call).
 */

export type KnowledgeQueryIntent =
  | 'factual_lookup'
  | 'temporal_comparison'
  | 'decision_history'
  | 'action_tracking'
  | 'competitive_intel'
  | 'summarization'
  | 'cross_reference'
  | 'open_synthesis';

export interface ClassifiedKnowledgeQuery {
  intent: KnowledgeQueryIntent;
  /** Optional entry types to bias semantic / FTS filters */
  types?: string[];
  /** Prefer search that drops superseded / expired rows */
  preferCurrentOnly: boolean;
  /** When true, also fetch temporal history rows for the same keywords */
  includeHistory: boolean;
}

const DECISION_RE = /\b(decided|decision|agreed|resolution|approved)\b/i;
const ACTION_RE = /\b(action item|follow[- ]?up|todo|unresolved|due|assigned)\b/i;
const COMPETITOR_RE = /\b(competitor|competitive|vs\.?|market intel|claim)\b/i;
const TEMPORAL_RE = /\b(changed|evolution|history|timeline|used to|previously|over time|q[1-4]|quarter)\b/i;
const MEETING_RE = /\b(meeting|last week|recap|summarize meetings|transcript)\b/i;
const BRAND_RE = /\b(brand|guideline|voice|color|palette|logo|tone|visual)\b/i;

/**
 * Classify a natural-language knowledge question for retrieval routing.
 */
export function classifyKnowledgeQuery(query: string): ClassifiedKnowledgeQuery {
  const q = query.trim();
  if (!q) {
    return {
      intent: 'open_synthesis',
      preferCurrentOnly: false,
      includeHistory: false,
    };
  }

  if (TEMPORAL_RE.test(q)) {
    return {
      intent: 'temporal_comparison',
      preferCurrentOnly: false,
      includeHistory: true,
    };
  }

  if (ACTION_RE.test(q)) {
    return {
      intent: 'action_tracking',
      types: ['action_item', 'meeting', 'meeting_note'],
      preferCurrentOnly: true,
      includeHistory: false,
    };
  }

  if (DECISION_RE.test(q)) {
    return {
      intent: 'decision_history',
      types: ['decision', 'meeting', 'meeting_note', 'document'],
      preferCurrentOnly: true,
      includeHistory: true,
    };
  }

  if (COMPETITOR_RE.test(q)) {
    return {
      intent: 'competitive_intel',
      types: ['competitor', 'claim', 'guideline', 'brand_guideline', 'document'],
      preferCurrentOnly: true,
      includeHistory: false,
    };
  }

  if (MEETING_RE.test(q)) {
    return {
      intent: 'summarization',
      types: ['meeting', 'meeting_note'],
      preferCurrentOnly: false,
      includeHistory: false,
    };
  }

  if (BRAND_RE.test(q)) {
    return {
      intent: 'factual_lookup',
      types: [
        'guideline',
        'brand_guideline',
        'visual_identity',
        'verbal_identity',
        'brand_profile',
        'document',
      ],
      preferCurrentOnly: true,
      includeHistory: false,
    };
  }

  if (/\b(link|connect|related to|reference)\b/i.test(q)) {
    return {
      intent: 'cross_reference',
      preferCurrentOnly: false,
      includeHistory: false,
    };
  }

  return {
    intent: 'open_synthesis',
    preferCurrentOnly: true,
    includeHistory: false,
  };
}
