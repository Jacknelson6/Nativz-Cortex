import { describe, expect, it } from 'vitest';
import {
  displayIdeaFormat,
  displayIdeaVirality,
  effectiveVirality,
} from './video-idea-display';

/**
 * video-idea-display owns the "render this enum nicely" helpers used on the
 * topic-search results pages and the ideas drawer. Three contracts to pin:
 *
 *   1. displayIdeaFormat replaces underscores with spaces. The LLM emits
 *      snake_case ('how_to_tutorial'); the UI must read 'how to tutorial'.
 *      A regression that returned the raw token would surface as ugly
 *      copy on the ideas card without breaking anything else.
 *
 *   2. displayIdeaFormat falls back to 'Not specified' when the LLM
 *      returns null/undefined/empty. Some older runs stored null here; the
 *      fallback keeps the row from rendering as a blank pill.
 *
 *   3. effectiveVirality folds null/undefined to 'low'. Sorting + ranking
 *      treats absent virality as the floor (not as "unknown above all" or
 *      a thrown error), which matches how the ideas list ranks under-
 *      specified ideas at the bottom.
 */

describe('displayIdeaFormat', () => {
  it('replaces underscores with spaces', () => {
    expect(displayIdeaFormat('how_to_tutorial')).toBe('how to tutorial');
  });

  it('returns "Not specified" for null', () => {
    expect(displayIdeaFormat(null)).toBe('Not specified');
  });

  it('returns "Not specified" for undefined', () => {
    expect(displayIdeaFormat(undefined)).toBe('Not specified');
  });

  it('returns "Not specified" for empty string', () => {
    expect(displayIdeaFormat('')).toBe('Not specified');
  });

  it('returns "Not specified" for whitespace-only input', () => {
    expect(displayIdeaFormat('   ')).toBe('Not specified');
  });

  it('preserves a single-word format', () => {
    expect(displayIdeaFormat('vlog')).toBe('vlog');
  });
});

describe('effectiveVirality', () => {
  it('returns the value when defined', () => {
    expect(effectiveVirality('high')).toBe('high');
    expect(effectiveVirality('viral_potential')).toBe('viral_potential');
    expect(effectiveVirality('medium')).toBe('medium');
  });

  it('falls back to "low" for null', () => {
    expect(effectiveVirality(null)).toBe('low');
  });

  it('falls back to "low" for undefined', () => {
    expect(effectiveVirality(undefined)).toBe('low');
  });
});

describe('displayIdeaVirality', () => {
  it('replaces underscores with spaces (viral_potential -> "viral potential")', () => {
    expect(displayIdeaVirality('viral_potential')).toBe('viral potential');
  });

  it('passes through single-word levels untouched', () => {
    expect(displayIdeaVirality('high')).toBe('high');
    expect(displayIdeaVirality('medium')).toBe('medium');
    expect(displayIdeaVirality('low')).toBe('low');
  });

  it('renders null as "low" (effectiveVirality fallback applied first)', () => {
    expect(displayIdeaVirality(null)).toBe('low');
    expect(displayIdeaVirality(undefined)).toBe('low');
  });
});
