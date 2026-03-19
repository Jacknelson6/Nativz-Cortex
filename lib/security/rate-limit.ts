/**
 * General-purpose in-memory sliding-window rate limiter.
 *
 * Same caveat as lib/api-keys/rate-limit.ts: each serverless instance
 * maintains its own counter, so effective global limit is approximately
 * limit × concurrent_instances. Limits are set conservatively to account
 * for this.
 *
 * For truly global rate limiting, replace with Upstash Redis (@upstash/ratelimit).
 */

import { NextResponse } from 'next/server';

const CLEANUP_INTERVAL_MS = 60_000;

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      // Remove timestamps older than 2 minutes (max reasonable window)
      entry.timestamps = entry.timestamps.filter((t) => now - t < 120_000);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
    if (store.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Check rate limit for a given key using a sliding window.
 *
 * @param key - Unique identifier (e.g. userId + endpoint)
 * @param limit - Max requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 * @returns Object with allowed status, remaining requests, and reset timestamp
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  ensureCleanupTimer();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    store.set(key, { timestamps: [now] });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0];
    return { allowed: false, remaining: 0, resetAt: oldestInWindow + windowMs };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    resetAt: entry.timestamps[0] + windowMs,
  };
}

/** Default limits by endpoint type */
const AI_LIMIT = 10;
const AI_WINDOW_MS = 60_000;
const REGULAR_LIMIT = 60;
const REGULAR_WINDOW_MS = 60_000;

/**
 * Convenience helper that applies sensible defaults based on endpoint type.
 *
 * @param userId - Authenticated user ID
 * @param endpoint - API route path (used as part of the rate limit key)
 * @param type - 'ai' for expensive AI endpoints (10 req/min), 'regular' for standard (60 req/min)
 * @returns true if the request is allowed, false if rate limited
 */
export function rateLimitByUser(
  userId: string,
  endpoint: string,
  type: 'ai' | 'regular' = 'regular',
): { allowed: boolean; remaining: number; resetAt: number } {
  const limit = type === 'ai' ? AI_LIMIT : REGULAR_LIMIT;
  const windowMs = type === 'ai' ? AI_WINDOW_MS : REGULAR_WINDOW_MS;
  return rateLimit(`${userId}:${endpoint}`, limit, windowMs);
}

/**
 * Higher-order helper to add rate limiting to an API route handler.
 * Wraps the handler and returns a 429 response if the rate limit is exceeded.
 *
 * @param getUserId - Function to extract the user ID from the request (return null to skip rate limiting)
 * @param endpoint - API route path for rate limit keying
 * @param options - Rate limit options
 * @param handler - The actual route handler function
 */
export function withRateLimit(
  options: {
    endpoint: string;
    type?: 'ai' | 'regular';
    limit?: number;
    windowMs?: number;
  },
  handler: (
    req: Request,
    context: { userId: string; params?: unknown },
  ) => Promise<NextResponse>,
) {
  return async (req: Request, routeContext?: { params?: unknown }) => {
    // Extract user from supabase auth
    const { createServerSupabaseClient } = await import('@/lib/supabase/server');
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Apply rate limit
    let result;
    if (options.limit !== undefined && options.windowMs !== undefined) {
      result = rateLimit(`${user.id}:${options.endpoint}`, options.limit, options.windowMs);
    } else {
      result = rateLimitByUser(user.id, options.endpoint, options.type ?? 'regular');
    }

    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.resetAt),
          },
        },
      );
    }

    return handler(req, { userId: user.id, params: routeContext?.params });
  };
}
