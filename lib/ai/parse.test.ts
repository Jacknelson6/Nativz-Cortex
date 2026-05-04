import { describe, expect, it } from 'vitest';
import { parseAIResponseJSON } from './parse';

/**
 * parseAIResponseJSON is a JSON-repair pipeline for LLM output. It runs a
 * cascade of attempts and returns the first one that parses, throwing only
 * if every repair fails. Coverage targets each rung of the cascade so a
 * future refactor can't silently break a recovery path.
 *
 * Cascade order (per impl):
 *   1. Direct JSON.parse on the trimmed text (or the contents of a
 *      ```json fence if one is present)
 *   2. Strip markdown formatting (** * `) inside string values
 *   3. Escape unescaped literal \n / \r inside strings
 *   4. Trailing commas + smart quotes + control-character escaping
 *   5. Brace-bounded extract + re-escape inner quotes
 *   6. Throw with a preview snippet of the raw text
 */

describe('parseAIResponseJSON — happy path', () => {
  it('parses a clean JSON object', () => {
    const result = parseAIResponseJSON<{ a: number }>('{"a": 1}');
    expect(result).toEqual({ a: 1 });
  });

  it('parses a clean JSON array', () => {
    const result = parseAIResponseJSON<number[]>('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('trims surrounding whitespace before parsing', () => {
    const result = parseAIResponseJSON<{ a: number }>('   \n {"a": 1}   \n');
    expect(result).toEqual({ a: 1 });
  });
});

describe('parseAIResponseJSON — empty / blank input', () => {
  it('throws a model-unavailable hint on empty string', () => {
    expect(() => parseAIResponseJSON('')).toThrow(/empty response/i);
  });

  it('throws on whitespace-only input', () => {
    expect(() => parseAIResponseJSON('   \n\t  ')).toThrow(/empty response/i);
  });
});

describe('parseAIResponseJSON — markdown code fences', () => {
  it('strips a ```json ... ``` fence', () => {
    const wrapped = '```json\n{"a": 1}\n```';
    expect(parseAIResponseJSON<{ a: number }>(wrapped)).toEqual({ a: 1 });
  });

  it('strips a bare ``` ... ``` fence', () => {
    const wrapped = '```\n{"a": 1}\n```';
    expect(parseAIResponseJSON<{ a: number }>(wrapped)).toEqual({ a: 1 });
  });

  it('strips an inline fence and parses', () => {
    const wrapped = 'sure, here:\n```json\n{"x": "y"}\n```';
    expect(parseAIResponseJSON<{ x: string }>(wrapped)).toEqual({ x: 'y' });
  });
});

describe('parseAIResponseJSON — markdown inside string values', () => {
  // Note: markdown stripping is a *repair* step, only reached when direct
  // JSON.parse fails. A well-formed JSON with markdown inside its strings
  // parses on attempt 1 and the markdown survives. The strip step matters
  // when markdown combines with another issue (trailing comma etc.) so
  // attempt 4's repair sequence can recover.

  it('preserves markdown inside string values when JSON is otherwise valid', () => {
    const text = '{"note": "Replace the **first** clip"}';
    expect(parseAIResponseJSON<{ note: string }>(text)).toEqual({
      note: 'Replace the **first** clip',
    });
  });

  it('strips markdown when combined with a trailing-comma error (cascade attempt 4)', () => {
    const text = '{"note": "Trim **the intro**",}';
    expect(parseAIResponseJSON<{ note: string }>(text)).toEqual({
      note: 'Trim the intro',
    });
  });

  it('strips backticks when combined with a trailing-comma error', () => {
    const text = '{"note": "Wrap `code` here",}';
    expect(parseAIResponseJSON<{ note: string }>(text)).toEqual({
      note: 'Wrap code here',
    });
  });
});

describe('parseAIResponseJSON — embedded literal newlines', () => {
  it('escapes a raw \\n inside a string', () => {
    const text = '{"caption": "line one\nline two"}';
    const result = parseAIResponseJSON<{ caption: string }>(text);
    expect(result.caption).toBe('line one\nline two');
  });

  it('escapes a raw \\r inside a string', () => {
    const text = '{"caption": "line one\rline two"}';
    const result = parseAIResponseJSON<{ caption: string }>(text);
    expect(result.caption).toBe('line one\rline two');
  });
});

describe('parseAIResponseJSON — trailing commas and smart quotes', () => {
  it('strips trailing commas before }', () => {
    const text = '{"a": 1, "b": 2,}';
    expect(parseAIResponseJSON<{ a: number; b: number }>(text)).toEqual({
      a: 1,
      b: 2,
    });
  });

  it('strips trailing commas before ]', () => {
    const text = '{"items": [1, 2, 3,]}';
    expect(parseAIResponseJSON<{ items: number[] }>(text)).toEqual({
      items: [1, 2, 3],
    });
  });

  it('replaces smart double quotes with ASCII quotes', () => {
    const text = '{“a”: 1}';
    expect(parseAIResponseJSON<{ a: number }>(text)).toEqual({ a: 1 });
  });

  it('handles tab characters inside strings', () => {
    const text = '{"a": "x\ty"}';
    expect(parseAIResponseJSON<{ a: string }>(text)).toEqual({ a: 'x\ty' });
  });
});

describe('parseAIResponseJSON — brace extraction (last-resort)', () => {
  it('extracts the JSON object even if there is text after the closing brace', () => {
    const text = '{"a": 1}\n\nThank you for the input!';
    expect(parseAIResponseJSON<{ a: number }>(text)).toEqual({ a: 1 });
  });

  it('extracts the JSON object even if there is text before it', () => {
    const text = 'Sure, here you go: {"a": 1}';
    expect(parseAIResponseJSON<{ a: number }>(text)).toEqual({ a: 1 });
  });
});

describe('parseAIResponseJSON — terminal failure', () => {
  it('throws with a preview of the raw text when nothing parses', () => {
    const garbage = 'this is not json at all, just prose with no braces';
    expect(() => parseAIResponseJSON(garbage)).toThrow(/Failed to parse AI response/);
    expect(() => parseAIResponseJSON(garbage)).toThrow(/this is not json/);
  });

  it('truncates the preview at 200 chars', () => {
    const garbage = 'x'.repeat(500);
    let caught: Error | null = null;
    try {
      parseAIResponseJSON(garbage);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeTruthy();
    // The error message should contain a 200-char preview, not the full 500.
    expect(caught!.message).toMatch(/Response starts with: "x{200}\.\.\."/);
  });
});

describe('parseAIResponseJSON — type generic', () => {
  it('returns the value typed as T (caller-asserted)', () => {
    interface Plan {
      title: string;
      steps: string[];
    }
    const text = '{"title": "ship it", "steps": ["a", "b"]}';
    const plan = parseAIResponseJSON<Plan>(text);
    expect(plan.title).toBe('ship it');
    expect(plan.steps).toEqual(['a', 'b']);
  });
});
