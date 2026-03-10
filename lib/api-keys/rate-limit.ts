const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

const counters = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(keyId: string): boolean {
  const now = Date.now();
  const entry = counters.get(keyId);

  if (!entry || now > entry.resetAt) {
    counters.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= MAX_REQUESTS;
}
