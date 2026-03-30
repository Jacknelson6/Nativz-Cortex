import { describe, expect, it } from 'vitest';
import {
  buildOrderedModelChain,
  DEFAULT_CHAIN_BY_TIER,
  getFeatureRoutingPolicy,
  getFeatureRoutingSummaryItems,
} from '@/lib/ai/routing-policy';

describe('getFeatureRoutingPolicy', () => {
  it('maps premium features to the premium chain', () => {
    const policy = getFeatureRoutingPolicy('idea_generation');
    expect(policy.tier).toBe('premium');
    expect(policy.chain).toEqual(DEFAULT_CHAIN_BY_TIER.premium);
  });

  it('maps helper features to the standard chain', () => {
    const policy = getFeatureRoutingPolicy('scheduler_hashtag_suggestions');
    expect(policy.tier).toBe('standard');
    expect(policy.chain).toEqual(DEFAULT_CHAIN_BY_TIER.standard);
  });

  it('maps utility features to the utility chain', () => {
    const policy = getFeatureRoutingPolicy('task_parse');
    expect(policy.tier).toBe('utility');
    expect(policy.chain).toEqual(DEFAULT_CHAIN_BY_TIER.utility);
  });

  it('treats unknown or missing features as standard', () => {
    expect(getFeatureRoutingPolicy(undefined).tier).toBe('standard');
    expect(getFeatureRoutingPolicy('totally_new_feature').tier).toBe('standard');
  });
});

describe('getFeatureRoutingSummaryItems', () => {
  it('returns grouped summaries with representative features', () => {
    const items = getFeatureRoutingSummaryItems();
    const ids = items.map((item) => item.id);

    expect(ids).toContain('premium_generation');
    expect(ids).toContain('standard_helpers');
    expect(ids).toContain('utility_background');
    expect(items.find((item) => item.id === 'premium_generation')?.features).toContain('idea_generation');
    expect(items.find((item) => item.id === 'utility_background')?.features).toContain('task_parse');
  });
});

describe('buildOrderedModelChain', () => {
  it('dedupes explicit, policy, and fallback models in order', () => {
    const chain = buildOrderedModelChain({
      explicitPreference: ['deepseek/deepseek-v3.2', 'openai/gpt-5.4-mini'],
      policyPreference: DEFAULT_CHAIN_BY_TIER.standard,
      primary: 'openai/gpt-5.4-mini',
      fallbacks: ['qwen/qwen3-30b-a3b', 'deepseek/deepseek-v3.2'],
    });

    expect(chain).toEqual([
      'deepseek/deepseek-v3.2',
      'openai/gpt-5.4-mini',
      'qwen/qwen3-30b-a3b',
    ]);
  });
});
