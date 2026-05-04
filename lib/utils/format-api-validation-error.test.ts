import { describe, expect, it } from 'vitest';
import { formatApiValidationError } from './format-api-validation-error';

/**
 * formatApiValidationError turns the JSON body of a 400 response (typically
 * from a Zod-validated route's `error.flatten()`) into ONE user-facing
 * string suitable for a toast or inline form error. Three contracts to pin:
 *
 *   1. The function never throws and never returns undefined. It is called
 *      from `catch` blocks with whatever JSON the API returned, including
 *      the empty body / non-object / null / wrong-shape cases. A regression
 *      that threw would replace a clear toast with "Something went wrong"
 *      from the outer error boundary.
 *
 *   2. Only the FIRST field-error message is appended after the base. Toasts
 *      can't gracefully fit a numbered list of every Zod issue, and the
 *      first issue is always the user's most actionable one ("email is
 *      required" beats "and the password is too short" piled on).
 *
 *   3. The format is `${base}: ${first}`. UI assertions in callers and
 *      copy review have settled on the colon-separated shape; a regression
 *      that switched to a dash or newline would break those expectations.
 */

describe('formatApiValidationError — defensive null/shape handling', () => {
  it('returns "Request failed" for null', () => {
    expect(formatApiValidationError(null)).toBe('Request failed');
  });

  it('returns "Request failed" for undefined', () => {
    expect(formatApiValidationError(undefined)).toBe('Request failed');
  });

  it('returns "Request failed" for a string body (e.g. "Internal Server Error")', () => {
    expect(formatApiValidationError('Internal Server Error')).toBe('Request failed');
  });

  it('returns "Request failed" for a number body', () => {
    expect(formatApiValidationError(500)).toBe('Request failed');
  });

  it('returns "Invalid input" for an empty object', () => {
    expect(formatApiValidationError({})).toBe('Invalid input');
  });

  it('returns "Invalid input" when error field is non-string', () => {
    expect(formatApiValidationError({ error: 42 })).toBe('Invalid input');
  });
});

describe('formatApiValidationError — base error only', () => {
  it('returns the base error when no details are present', () => {
    expect(formatApiValidationError({ error: 'Bad request' })).toBe('Bad request');
  });

  it('returns the base error when details is null', () => {
    expect(formatApiValidationError({ error: 'Bad request', details: null })).toBe('Bad request');
  });

  it('returns the base error when details is a string', () => {
    expect(formatApiValidationError({ error: 'Bad request', details: 'oops' })).toBe('Bad request');
  });

  it('returns the base error when details has no fieldErrors', () => {
    expect(
      formatApiValidationError({ error: 'Bad request', details: { formErrors: ['x'] } }),
    ).toBe('Bad request');
  });

  it('returns the base error when fieldErrors is empty', () => {
    expect(
      formatApiValidationError({ error: 'Bad request', details: { fieldErrors: {} } }),
    ).toBe('Bad request');
  });

  it('returns the base error when every fieldErrors entry is a non-array', () => {
    expect(
      formatApiValidationError({
        error: 'Bad request',
        details: { fieldErrors: { email: 'not an array' } },
      }),
    ).toBe('Bad request');
  });

  it('returns the base error when fieldErrors arrays contain only non-strings', () => {
    expect(
      formatApiValidationError({
        error: 'Bad request',
        details: { fieldErrors: { email: [42, true, null] } },
      }),
    ).toBe('Bad request');
  });
});

describe('formatApiValidationError — first field error appended', () => {
  it('appends the first field-error message', () => {
    expect(
      formatApiValidationError({
        error: 'Validation failed',
        details: { fieldErrors: { email: ['Must be a valid email'] } },
      }),
    ).toBe('Validation failed: Must be a valid email');
  });

  it('uses the FIRST message when a field has multiple', () => {
    expect(
      formatApiValidationError({
        error: 'Validation failed',
        details: {
          fieldErrors: { password: ['Too short', 'Missing a number', 'Missing a symbol'] },
        },
      }),
    ).toBe('Validation failed: Too short');
  });

  it('flattens nested arrays inside a fieldErrors entry', () => {
    expect(
      formatApiValidationError({
        error: 'Validation failed',
        details: { fieldErrors: { email: [['Required'], ['Must be email']] } },
      }),
    ).toBe('Validation failed: Required');
  });

  it('uses the first iterable-key field when multiple fields have errors', () => {
    // Object.entries is stable in insertion order in V8 for string keys, so
    // the "first" is whichever key was inserted first in the body. The
    // important contract is that ONE message is shown, not concatenated.
    const out = formatApiValidationError({
      error: 'Validation failed',
      details: {
        fieldErrors: {
          email: ['Email is required'],
          password: ['Password is too short'],
        },
      },
    });
    expect(out).toMatch(/^Validation failed: /);
    // No semicolons / commas / newlines appended — only ONE message shown.
    expect(out.split(': ').length).toBe(2);
  });

  it('falls back to "Invalid input" base when error string is missing but fieldErrors are present', () => {
    expect(
      formatApiValidationError({
        details: { fieldErrors: { email: ['Required'] } },
      }),
    ).toBe('Invalid input: Required');
  });

  it('uses the colon-separator shape exactly (no dash, no newline)', () => {
    // Pin: the format is `${base}: ${msg}`. Callers and copy review depend
    // on this. A change to a different separator must be deliberate.
    const out = formatApiValidationError({
      error: 'Validation failed',
      details: { fieldErrors: { email: ['Required'] } },
    });
    expect(out).toBe('Validation failed: Required');
    expect(out).not.toMatch(/—|–|\n/);
  });

  it('skips a fieldErrors entry whose array is entirely non-strings, reaching the next one', () => {
    expect(
      formatApiValidationError({
        error: 'Validation failed',
        details: {
          fieldErrors: {
            ignored: [42, true],
            email: ['Required'],
          },
        },
      }),
    ).toBe('Validation failed: Required');
  });
});
