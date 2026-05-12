import { ZernioPostingService } from '@/lib/posting/zernio';

/**
 * Pre-publish token readiness probe (PUB-01).
 *
 * Why this exists: `social_profiles.token_status` is the value the daily
 * `connection-expired-watch` cron writes after probing Zernio. That can
 * be up to ~23 hours stale. A token that died at 3am will sail through
 * the 2pm publish attempt with `token_status = 'valid'`, hit Zernio,
 * get rejected per-leg, and land as `partially_failed` -> 30 min retry
 * -> eventual exhaustion. By the time the team sees the chat ping the
 * post slot has slipped by ~1.5 hours. This module asks Zernio directly
 * for each account's current health *right before* `publishPost` is
 * called and lets the cron short-circuit a doomed publish into an
 * immediate `failed` leg with a precise reason.
 *
 * In-memory cache: a single publish-cron tick can have ~5 posts x 4
 * platforms = 20 legs in flight. With no cache that's 20 round-trips
 * to Zernio's `/accounts/{id}/health` for what is functionally the
 * same answer per account. The cache is keyed on accountId with a
 * 90-second TTL — long enough to dedup all legs in a single cron run
 * across the publish-posts batch, short enough that a token that
 * actually died between two cron ticks gets caught on the next run.
 *
 * The cache is module-scoped and lives in the Vercel function instance.
 * Fluid Compute keeps the same instance warm across overlapping
 * invocations, so the cache also dedups across nearly-concurrent cron
 * fires (the publish cron runs every 2 minutes — past the 90s TTL, but
 * any "warm next tick" reads benefit nonetheless).
 */

const CACHE_TTL_MS = 90_000;

type HealthSnapshot = NonNullable<
  Awaited<ReturnType<ZernioPostingService['getAccountHealth']>>
>;

interface CacheEntry {
  /** Resolved snapshot from Zernio, or `null` if the probe came back empty. */
  health: HealthSnapshot | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Test-only: clear the in-memory cache. Production code should never
 * call this — the TTL handles eviction. Exported so unit tests can
 * exercise miss-after-expiry behavior without sleeping 90 seconds.
 */
export function _resetReadinessCache(): void {
  cache.clear();
}

export type PublishReadinessReason =
  | 'token_expired'
  | 'token_needs_refresh'
  | 'token_expiry_passed'
  | 'probe_failed'
  | 'no_account_id';

export interface PublishReadiness {
  /** True iff Zernio's authoritative check says the leg can ship now. */
  ready: boolean;
  /**
   * Stable machine-readable code for branching on the caller side.
   * `undefined` only when `ready === true`.
   */
  reason?: PublishReadinessReason;
  /**
   * Human-readable text suitable for stamping
   * `scheduled_post_platforms.failure_reason` directly. Always set when
   * `ready === false`.
   */
  detail?: string;
  /**
   * Raw health snapshot from Zernio when available. Lets the caller
   * persist `token_status` / `token_expires_at` without a second probe.
   * `null` when the probe itself failed (treat as transient).
   */
  health: HealthSnapshot | null;
}

function evaluate(health: HealthSnapshot | null): PublishReadiness {
  if (!health) {
    return {
      ready: false,
      reason: 'probe_failed',
      detail:
        'Zernio account health probe failed at publish time (no response). Will retry next cron tick.',
      health: null,
    };
  }
  if (!health.tokenValid) {
    return {
      ready: false,
      reason: 'token_expired',
      detail:
        'Token dead at publish (Zernio reported tokenValid=false). Reconnect required.',
      health,
    };
  }
  if (health.needsRefresh) {
    return {
      ready: false,
      reason: 'token_needs_refresh',
      detail:
        'Token dead at publish (Zernio flagged needsRefresh). Reconnect required.',
      health,
    };
  }
  if (
    health.tokenExpiresAt &&
    new Date(health.tokenExpiresAt).getTime() < Date.now()
  ) {
    return {
      ready: false,
      reason: 'token_expiry_passed',
      detail:
        'Token dead at publish (expiry timestamp already past). Reconnect required.',
      health,
    };
  }
  return { ready: true, health };
}

/**
 * Probe a single Zernio account for publish readiness. Cached for
 * `CACHE_TTL_MS` so multiple legs in the same cron run reuse the
 * answer.
 *
 * The transient `probe_failed` branch (Zernio returned null) is *not*
 * cached — we don't want a brief Zernio blip to lock every subsequent
 * leg into `failed` for the next 90 seconds. A real bad-token answer
 * is cached because that state won't fix itself.
 *
 * @param accountId  Zernio's MongoDB ObjectId — `social_profiles.late_account_id`.
 *                   `null` / empty returns `ready: false` with `no_account_id`
 *                   for caller convenience (the cron already rejects these
 *                   upstream, but the guard means callers don't have to
 *                   pre-validate).
 */
export async function checkLegReadiness(
  accountId: string | null | undefined,
): Promise<PublishReadiness> {
  if (!accountId) {
    return {
      ready: false,
      reason: 'no_account_id',
      detail: 'Profile not connected to Zernio (no late_account_id).',
      health: null,
    };
  }

  const now = Date.now();
  const cached = cache.get(accountId);
  if (cached && cached.expiresAt > now) {
    return evaluate(cached.health);
  }

  const service = new ZernioPostingService();
  const health = await service.getAccountHealth(accountId);

  // Cache only durable answers; let transient failures retry on the
  // next leg in the same run.
  if (health) {
    cache.set(accountId, { health, expiresAt: now + CACHE_TTL_MS });
  }

  return evaluate(health);
}

/**
 * Convenience: probe many accounts in parallel and return them in a
 * Map keyed by accountId. Caller can iterate the per-leg loop and
 * look up its readiness without awaiting each probe sequentially.
 */
export async function checkLegReadinessBatch(
  accountIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, PublishReadiness>> {
  const unique = Array.from(
    new Set(accountIds.filter((id): id is string => !!id)),
  );
  const entries = await Promise.all(
    unique.map(async (id) => [id, await checkLegReadiness(id)] as const),
  );
  return new Map(entries);
}
