import { DEFAULT_OPENROUTER_MODEL } from './openrouter-default-model';

export type AiRoutingTier = 'premium' | 'standard' | 'utility';

export type AiRoutingSummaryItem = {
  id: string;
  title: string;
  description: string;
  tier: AiRoutingTier;
  chain: string[];
  features: string[];
};

export const DEFAULT_CHAIN_BY_TIER: Record<AiRoutingTier, string[]> = {
  premium: [DEFAULT_OPENROUTER_MODEL],
  standard: [DEFAULT_OPENROUTER_MODEL],
  utility: ['openai/gpt-5.4-nano', DEFAULT_OPENROUTER_MODEL],
};

const FEATURE_GROUPS: AiRoutingSummaryItem[] = [
  {
    id: 'premium_generation',
    title: 'Premium generation',
    description: 'Core research, strategy, ideas, and brand outputs where response quality matters most.',
    tier: 'premium',
    chain: DEFAULT_CHAIN_BY_TIER.premium,
    features: [
      'topic_search',
      'topic_expansion',
      'idea_generation',
      'script_generation',
      'strategy_pipeline',
      'pillar_generation',
      'pillar_reroll',
      'client_strategy',
      'shoot_plan',
      'cron_shoot_planner',
      'shoot_ideation',
      'brand_dna_compile',
      'brand_dna_products',
      'brand_dna_verbal',
      'brand_dna_audience_benchmarks',
      'ad_copy_generation',
      'video_analysis',
    ],
  },
  {
    id: 'standard_helpers',
    title: 'Standard helpers',
    description: 'User-facing helpers and extraction tasks where we still want solid quality at lower cost.',
    tier: 'standard',
    chain: DEFAULT_CHAIN_BY_TIER.standard,
    features: [
      'emotion_explain',
      'meeting_import',
      'knowledge_structuring',
      'knowledge_brand_profile',
      'client_analyze_url',
      'scheduler_caption_improve',
      'scheduler_hashtag_suggestions',
      'scheduler_auto_schedule_caption',
      'social_results_bio_generation',
      'ad_creative_brief',
      'ad_image_prompt_modifier',
      'analysis_chat',
      'analysis_item_analysis',
      'analysis_item_insights',
      'analysis_item_replication',
      'analysis_item_rescript',
      'moodboard_video_processing',
    ],
  },
  {
    id: 'utility_background',
    title: 'Utility and background',
    description: 'Low-stakes titles, parsing, summaries, and backfills optimized for lowest practical cost.',
    tier: 'utility',
    chain: DEFAULT_CHAIN_BY_TIER.utility,
    features: [
      'task_parse',
      'history_title_shortening',
      'analysis_transcript_title',
      'analysis_pdf_title',
      'pipeline_summary',
      'client_backfill_industry',
    ],
  },
];

function featureGroupForFeature(feature?: string): AiRoutingSummaryItem {
  if (!feature) return FEATURE_GROUPS[1];
  const normalized = feature.trim().toLowerCase();
  if (!normalized) return FEATURE_GROUPS[1];

  const direct = FEATURE_GROUPS.find((group) => group.features.includes(normalized));
  if (direct) return direct;

  if (normalized.startsWith('brand_dna_')) return FEATURE_GROUPS[0];
  if (normalized.startsWith('topic_')) return FEATURE_GROUPS[0];
  if (normalized.startsWith('scheduler_')) return FEATURE_GROUPS[1];
  if (normalized.startsWith('analysis_')) return FEATURE_GROUPS[1];
  if (normalized.startsWith('knowledge_')) return FEATURE_GROUPS[1];
  if (normalized.startsWith('shoot_')) return FEATURE_GROUPS[0];

  return FEATURE_GROUPS[1];
}

export function getFeatureRoutingPolicy(feature?: string): {
  feature: string | null;
  tier: AiRoutingTier;
  chain: string[];
  groupId: string;
  title: string;
  description: string;
} {
  const group = featureGroupForFeature(feature);
  return {
    feature: feature?.trim() || null,
    tier: group.tier,
    chain: [...group.chain],
    groupId: group.id,
    title: group.title,
    description: group.description,
  };
}

export function getFeatureRoutingSummaryItems(): AiRoutingSummaryItem[] {
  return FEATURE_GROUPS.map((group) => ({
    ...group,
    chain: [...group.chain],
    features: [...group.features],
  }));
}

export function buildOrderedModelChain(args: {
  explicitPreference?: string[];
  policyPreference?: string[];
  primary?: string;
  fallbacks?: string[];
}): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const candidate of [
    ...(args.explicitPreference ?? []),
    ...(args.policyPreference ?? []),
    args.primary ?? '',
    ...(args.fallbacks ?? []),
  ]) {
    const model = candidate.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    ordered.push(model);
  }

  return ordered;
}
