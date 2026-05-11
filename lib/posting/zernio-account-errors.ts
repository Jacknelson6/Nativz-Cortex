/**
 * Classify per-leg Zernio failures as account-level (token/auth/permission)
 * vs. content-level (rate limit, media format, platform policy). Account-level
 * failures are deterministic: retrying the same payload with the same token
 * keeps failing until the user reconnects. Content-level failures are
 * transient or fixable by the operator without reconnecting.
 *
 * When we detect account-level we:
 *   1. Flip `social_profiles.is_active = false` so the post-health cron and
 *      profile-list UIs stop treating the account as connected.
 *   2. Stamp `disconnect_alerted_at` so the next post-health run skips the
 *      duplicate alert (the cron uses the same column).
 *   3. Fire `account_disconnected` notification mirroring the webhook path.
 *
 * The caller (publish cron / schedule-drop) handles per-leg retry policy
 * separately — we don't change retry behavior here, just surface the right
 * notification so the team can ask the client to reconnect.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyZernioWebhookRecipients } from '@/lib/social/zernio-webhook-notify';
import { markPlatformConnection } from '@/lib/onboarding/api';
import { ZernioApiError } from '@/lib/posting/zernio';

const ACCOUNT_LEVEL_PATTERNS: RegExp[] = [
  /token[_\s-]?expired/i,
  /token[_\s-]?invalid/i,
  /invalid[_\s-]?token/i,
  /refresh[_\s-]?token/i,
  /unauthor(?:ized|ised)/i,
  /not[_\s-]?author(?:ized|ised)/i,
  /permission[_\s-]?denied/i,
  /access[_\s-]?denied/i,
  /missing[_\s-]?permission/i,
  /reconnect/i,
  /disconnected/i,
  /account[_\s-]?(?:inactive|expired|suspended|deactivated|disabled)/i,
  /session[_\s-]?expired/i,
  /please.+(?:re-?(?:authenticate|authorize|connect|login|sign[_\s-]?in))/i,
  /credentials?[_\s-]?(?:invalid|expired|missing)/i,
  /no[_\s-]?refresh[_\s-]?token/i,
  /oauth[_\s-]?(?:error|expired|invalid)/i,
];

/**
 * Zernio's documented `errorCode` values that map to "account needs to
 * reconnect." More reliable than regex matching the human-readable string
 * because the codes are stable across platforms and Zernio versions. New
 * codes can be added here without breaking existing pattern matching.
 */
const ACCOUNT_LEVEL_CODES = new Set<string>([
  'token_expired',
  'token_invalid',
  'token_revoked',
  'refresh_failed',
  'reauth_required',
  'unauthorized',
  'permission_denied',
  'access_denied',
  'account_disconnected',
  'account_suspended',
  'account_inactive',
  'invalid_credentials',
  'oauth_invalid',
  'session_expired',
]);

/**
 * Zernio's documented `errorType` values (Stripe-like) that always mean the
 * underlying account auth is the problem. Distinct from the code list above
 * because `type` is broader: `authentication_error` covers multiple specific
 * codes.
 */
const ACCOUNT_LEVEL_TYPES = new Set<string>([
  'authentication_error',
  'permission_error',
]);

/**
 * True when the error text strongly suggests the underlying social account
 * needs to be reconnected. Conservative — false negatives are preferable
 * to false positives (we don't want to mark a working account inactive
 * just because the leg failed once with a generic 5xx).
 *
 * Accepts either a flat reason string (legacy publish result) OR a
 * structured `{ errorCode, errorType, message }` envelope (per-leg failure
 * row from Zernio's publish response). Prefer the structured form when
 * available — pattern matching is a fallback.
 */
export function isAccountLevelLegError(
  reason:
    | string
    | null
    | undefined
    | { errorCode?: string | null; errorType?: string | null; message?: string | null },
): boolean {
  if (!reason) return false;
  if (typeof reason === 'object') {
    if (reason.errorCode && ACCOUNT_LEVEL_CODES.has(reason.errorCode)) return true;
    if (reason.errorType && ACCOUNT_LEVEL_TYPES.has(reason.errorType)) return true;
    return isAccountLevelLegError(reason.message ?? null);
  }
  const text = reason.trim();
  if (!text) return false;
  return ACCOUNT_LEVEL_PATTERNS.some((re) => re.test(text));
}

/**
 * True when a thrown ZernioApiError indicates the API key itself is bad
 * (401 with no per-leg context). Distinct from per-leg auth errors which
 * arrive via `result.platforms[].error`.
 */
export function isZernioGlobalAuthError(err: unknown): err is ZernioApiError {
  return (
    err instanceof ZernioApiError &&
    (err.status === 401 || err.status === 403 || err.type === 'authentication_error')
  );
}

/**
 * Mark a single social profile as disconnected based on a per-leg failure.
 * Idempotent via the `disconnect_alerted_at` stamp — the second call within
 * the same incident updates `is_active` again (cheap) but skips the email.
 *
 * Returns true when a notification was emitted (for caller-side counting).
 */
export async function markProfileDisconnectedFromLegFailure(args: {
  admin: SupabaseClient;
  lateAccountId: string;
  reason: string;
}): Promise<boolean> {
  const { admin, lateAccountId, reason } = args;

  const { data: prof } = await admin
    .from('social_profiles')
    .select('id, platform, username, client_id, is_active, disconnect_alerted_at, clients(name)')
    .eq('late_account_id', lateAccountId)
    .maybeSingle();

  if (!prof) return false;

  const platform = (prof.platform as string) ?? 'social';
  const username = (prof.username as string | null) ?? null;
  const clientId = (prof.client_id as string | null) ?? null;
  const clientName =
    (Array.isArray(prof.clients)
      ? (prof.clients[0] as { name?: string } | undefined)?.name
      : (prof.clients as { name?: string } | null)?.name) ?? 'Unknown client';
  const alreadyAlerted = (prof.disconnect_alerted_at as string | null) != null;

  await admin
    .from('social_profiles')
    .update({
      is_active: false,
      disconnect_alerted_at: alreadyAlerted ? prof.disconnect_alerted_at : new Date().toISOString(),
    })
    .eq('id', prof.id as string);

  if (clientId) {
    try {
      await markPlatformConnection({
        client_id: clientId,
        platform,
        status: 'pending',
        zernio_account_id: lateAccountId,
        username,
      });
    } catch (err) {
      console.error('[zernio-account-errors] markPlatformConnection failed:', err);
    }
  }

  if (alreadyAlerted) return false;

  await notifyZernioWebhookRecipients({
    type: 'account_disconnected',
    title: `Social account disconnected, ${clientName}`,
    body: `${platform}${username ? ` (@${username})` : ''} returned an auth error during publish: ${reason.slice(0, 200)}. Reconnect in scheduler or Zernio dashboard.`,
    linkPath: '/admin/scheduler',
  });
  return true;
}
