import { describe, expect, it } from 'vitest';
import {
  formatTokens,
  formatUsd,
  formatUsdAxis,
  providerFromModel,
  providerLabel,
} from './format';

describe('providerFromModel', () => {
  it('handles canonical provider/model slugs', () => {
    expect(providerFromModel('openai/gpt-5.4-mini')).toBe('openai');
    expect(providerFromModel('anthropic/claude-sonnet-4-5')).toBe('anthropic');
    expect(providerFromModel('google/gemini-2.5-flash')).toBe('google');
    expect(providerFromModel('gemini/gemini-embedding-001')).toBe('google');
    expect(providerFromModel('perplexity/sonar-large')).toBe('perplexity');
    expect(providerFromModel('openrouter/hunter-alpha')).toBe('openrouter');
    expect(providerFromModel('groq/whisper-large-v3')).toBe('groq');
  });

  it('classifies bare model names by family', () => {
    expect(providerFromModel('gpt-4o-mini')).toBe('openai');
    expect(providerFromModel('claude-3-5-haiku')).toBe('anthropic');
    expect(providerFromModel('gemini-embedding-001')).toBe('google');
    expect(providerFromModel('whisper-large-v3-turbo')).toBe('groq');
    expect(providerFromModel('grok-2')).toBe('grok');
    expect(providerFromModel('deepseek-v3')).toBe('deepseek');
    expect(providerFromModel('qwen3-30b')).toBe('qwen');
    expect(providerFromModel('nvidia/nemotron-3-super')).toBe('nvidia');
    expect(providerFromModel('mistral-large')).toBe('mistral');
  });

  it('treats dashscope as qwen', () => {
    // Dashscope is Alibaba's hosted Qwen; roll it under qwen for readability.
    expect(providerFromModel('dashscope/qwen3.5-flash')).toBe('qwen');
  });

  it('returns "unknown" for null / empty / completely unrecognised input', () => {
    expect(providerFromModel(null)).toBe('unknown');
    expect(providerFromModel(undefined)).toBe('unknown');
    expect(providerFromModel('')).toBe('unknown');
    // Bare name with no family prefix and no slash → unknown. Names that
    // DO have a slash return the slash-prefix as the bucket so a new
    // provider shows up distinct from every other unmapped model.
    expect(providerFromModel('frob-mystery')).toBe('unknown');
    expect(providerFromModel('frob/mystery-1')).toBe('frob');
  });

  it('is case-insensitive', () => {
    expect(providerFromModel('OpenAI/GPT-5.4')).toBe('openai');
    expect(providerFromModel('Anthropic/Claude-Sonnet')).toBe('anthropic');
  });
});

describe('providerLabel', () => {
  it('maps known slugs to display labels', () => {
    expect(providerLabel('openai')).toBe('OpenAI');
    expect(providerLabel('anthropic')).toBe('Anthropic');
    expect(providerLabel('google')).toBe('Google (Gemini)');
    expect(providerLabel('grok')).toBe('Grok (xAI)');
    expect(providerLabel('unknown')).toBe('Unclassified');
  });

  it('falls back to the slug itself for unmapped values', () => {
    expect(providerLabel('frob-mystery')).toBe('frob-mystery');
  });
});

describe('formatUsd', () => {
  it('shows $0.00 for zero', () => {
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('flags sub-penny non-zero values as <$0.01', () => {
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(0.00001)).toBe('<$0.01');
  });

  it('formats single-dollar amounts to two decimals', () => {
    expect(formatUsd(0.01)).toBe('$0.01');
    expect(formatUsd(1.23456)).toBe('$1.23');
    expect(formatUsd(9.999)).toBe('$10.00');
  });

  it('keeps two decimals for sub-thousand amounts', () => {
    expect(formatUsd(42.5)).toBe('$42.50');
    expect(formatUsd(999.99)).toBe('$999.99');
  });

  it('groups thousands without decimals for large amounts', () => {
    expect(formatUsd(1234)).toBe('$1,234');
    expect(formatUsd(1_234_567)).toBe('$1,234,567');
  });

  it('returns $0.00 for non-finite input', () => {
    expect(formatUsd(Number.NaN)).toBe('$0.00');
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe('$0.00');
  });
});

describe('formatUsdAxis', () => {
  it('uses $0 (no decimals) for zero', () => {
    expect(formatUsdAxis(0)).toBe('$0');
  });

  it('shares the <$0.01 floor with formatUsd', () => {
    expect(formatUsdAxis(0.004)).toBe('<$0.01');
  });

  it('drops decimals above $1 for axis tick compactness', () => {
    expect(formatUsdAxis(0.5)).toBe('$0.50');
    expect(formatUsdAxis(12.7)).toBe('$13');
    expect(formatUsdAxis(999)).toBe('$999');
  });

  it('collapses four+ digit values with a k suffix', () => {
    expect(formatUsdAxis(1000)).toBe('$1.0k');
    expect(formatUsdAxis(12_345)).toBe('$12.3k');
  });
});

describe('formatTokens', () => {
  it('shows the raw number with commas under 1K', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('compresses to K below 10K', () => {
    // 1,234 → 1.2K: three-digit precision would read worse on axis labels.
    expect(formatTokens(1234)).toBe('1.2K');
    expect(formatTokens(9999)).toBe('10.0K');
  });

  it('drops decimals above 10K to keep labels short', () => {
    expect(formatTokens(12_345)).toBe('12K');
    expect(formatTokens(999_999)).toBe('1000K');
  });

  it('switches to M above a million', () => {
    expect(formatTokens(1_234_567)).toBe('1.23M');
    expect(formatTokens(50_000_000)).toBe('50.00M');
  });
});
