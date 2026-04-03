/**
 * Helpers for Postgres / PostgREST-safe JSON and text (jsonb columns, TEXT fields).
 * Handles BigInt, non-finite numbers, NUL bytes in strings — common causes of
 * serialization failures ("invalid json", empty body edge cases).
 */

/** Strip U+0000 — Postgres TEXT / JSON string values reject embedded NUL. */
export function sanitizePostgresText(s: string): string {
  return s.replace(/\u0000/g, '');
}

/** Safe numeric for INTEGER / DECIMAL columns (avoids NaN/Infinity reaching the client). */
export function finiteOr(n: unknown, fallback: number): number {
  const x = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(x) ? x : fallback;
}

/** Coerce unknown to a plain object for jsonb object columns. */
export function safeJsonbObject<T extends Record<string, unknown>>(v: unknown, fallback: T): T {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) return v as T;
  return fallback;
}

/** Coerce unknown to array for jsonb array columns. */
export function safeJsonbArray<T>(v: unknown, fallback: T[]): T[] {
  return Array.isArray(v) ? (v as T[]) : fallback;
}

/**
 * Clone a value into JSON-safe data for Postgres json/jsonb columns (PostgREST).
 */
export function cloneJsonForPostgres<T>(value: T): T {
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, v: unknown) => {
        if (typeof v === 'bigint') return v.toString();
        if (typeof v === 'number' && !Number.isFinite(v)) return null;
        if (typeof v === 'string') return v.replace(/\u0000/g, '');
        return v;
      }),
    ) as T;
  } catch {
    return (Array.isArray(value) ? [] : {}) as T;
  }
}
