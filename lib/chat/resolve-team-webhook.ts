/**
 * Team webhook resolver with miscellaneous-catchall fallback.
 *
 * Each client can set its own `chat_webhook_url`. Some clients don't have one
 * (small/new accounts, internal demo brands, etc.) and the team-side
 * notifications for those clients used to silently no-op.
 *
 * Per-agency, a single client can be marked `is_misc_catchall = true`. Its
 * webhook is the fallback for every other client in the same agency that has
 * no webhook of its own. The flag is enforced unique per agency by index
 * `clients_misc_catchall_per_agency` (migration 230).
 *
 * Usage:
 *   const url = await resolveTeamChatWebhook(admin, {
 *     primaryUrl: client.chat_webhook_url,
 *     agency: client.agency,
 *   });
 *   postToGoogleChatSafe(url, { text }, 'caller-context');
 */
import type { SupabaseClient } from '@supabase/supabase-js';

interface ResolveOpts {
  /** The client's own webhook, if any. Returned as-is when truthy. */
  primaryUrl: string | null | undefined;
  /** The client's agency string (e.g. "Nativz", "Anderson Collaborative"). */
  agency: string | null | undefined;
}

/**
 * Returns the best available team-chat webhook URL, or null if none exists.
 *
 * Order:
 *   1. The client's own `chat_webhook_url`
 *   2. The agency's miscellaneous-catchall client's `chat_webhook_url`
 *   3. null (caller's `postToGoogleChatSafe` will no-op)
 */
export async function resolveTeamChatWebhook(
  admin: SupabaseClient,
  { primaryUrl, agency }: ResolveOpts,
): Promise<string | null> {
  const trimmedPrimary = primaryUrl?.trim();
  if (trimmedPrimary) return trimmedPrimary;
  if (!agency) return null;

  const { data, error } = await admin
    .from('clients')
    .select('chat_webhook_url')
    .eq('agency', agency)
    .eq('is_misc_catchall', true)
    .maybeSingle();

  if (error) {
    console.error('[resolve-team-webhook] catchall lookup failed:', error);
    return null;
  }

  const fallback = (data?.chat_webhook_url as string | null | undefined)?.trim();
  return fallback || null;
}
