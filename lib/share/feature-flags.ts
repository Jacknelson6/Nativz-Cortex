import { createAdminClient } from '@/lib/supabase/admin';

/**
 * PRD 09 §"Feature flag". Per-organization kill-switch for the share-link
 * comments v2 stack (PRDs 01-08). Resolves against
 * `organizations.feature_flags->>'share_link_comments_v2'`.
 *
 * Default-true: PRDs 01-08 already shipped before this flag landed. The
 * column was added as a forward-looking kill-switch so we can flip a
 * specific org back to the bare-link legacy behaviour without a deploy if
 * a regression hits production. Flip the key to `false` on the affected
 * org to opt out.
 *
 * Reads happen at the server-rendered share page and on the comment POST
 * routes. Null `organizationId` short-circuits to `true` so anonymous /
 * guest paths (no bound user, no org) still get the v2 experience.
 */
export async function isShareCommentsV2Enabled(
  organizationId: string | null,
): Promise<boolean> {
  if (!organizationId) return true;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('organizations')
      .select('feature_flags')
      .eq('id', organizationId)
      .maybeSingle<{ feature_flags: Record<string, unknown> | null }>();
    const raw = data?.feature_flags?.share_link_comments_v2;
    if (raw === false || raw === 'false') return false;
    return true;
  } catch (err) {
    console.warn('[share-v2-flag] read failed, defaulting to enabled', err);
    return true;
  }
}
