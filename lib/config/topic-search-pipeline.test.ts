import { describe, expect, it } from 'vitest';
import { topicPipelineFromEnvValue } from '@/lib/config/topic-search-pipeline';

describe('topicPipelineFromEnvValue', () => {
  it('defaults to llm_v1 when unset', () => {
    expect(topicPipelineFromEnvValue(undefined)).toBe('llm_v1');
  });

  it('uses legacy only when explicitly set', () => {
    expect(topicPipelineFromEnvValue('legacy')).toBe('legacy');
    expect(topicPipelineFromEnvValue(' LEGACY ')).toBe('legacy');
  });

  it('treats empty and llm_v1 as llm_v1', () => {
    expect(topicPipelineFromEnvValue('')).toBe('llm_v1');
    expect(topicPipelineFromEnvValue('llm_v1')).toBe('llm_v1');
  });
});
