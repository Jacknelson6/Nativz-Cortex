/**
 * Turn API `{ error, details }` from Zod flatten into a single user-visible string.
 */
export function formatApiValidationError(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Request failed';
  const d = data as { error?: unknown; details?: unknown };
  const base = typeof d.error === 'string' ? d.error : 'Invalid input';

  const details = d.details;
  if (!details || typeof details !== 'object') return base;

  const fieldErrors = (details as { fieldErrors?: Record<string, unknown> }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') return base;

  const messages: string[] = [];
  for (const [, raw] of Object.entries(fieldErrors)) {
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'string') messages.push(item);
        else if (Array.isArray(item)) {
          for (const x of item) {
            if (typeof x === 'string') messages.push(x);
          }
        }
      }
    }
  }

  if (messages.length === 0) return base;
  return `${base}: ${messages[0]}`;
}
