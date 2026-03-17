/**
 * In-memory sliding-window rate limiter.
 *
 * Limitation: each serverless instance maintains its own counter, so the
 * effective global limit is approximately MAX_REQUESTS × concurrent_instances.
 * The per-instance cap is set conservatively (30 req/min) so that even with
 * ~3 concurrent Vercel instances the aggregate stays under ~90 req/min.
 *
 * For a truly global rate limit, replace this with Upstash Redis
 * (@upstash/ratelimit) which provides atomic counters shared across all
 * instances with no cold-start penalty.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const CLEANUP_INTERVAL_MS = 60_000;

const counters = new Map<string, { count: number; resetAt: number }>();

// Periodically purge expired entries to prevent memory leaks in long-lived instances
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of counters) {
      if (now > entry.resetAt) {
        counters.delete(key);
      }
    }
    // If the map is empty, stop the timer to allow graceful GC
    if (counters.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow the process to exit even if the timer is still running
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

export function checkRateLimit(keyId: string): boolean {
  ensureCleanupTimer();

  const now = Date.now();
  const entry = counters.get(keyId);

  if (!entry || now > entry.resetAt) {
    counters.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= MAX_REQUESTS;
}
