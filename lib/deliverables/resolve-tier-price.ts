/**
 * Tier Stripe price-id resolution.
 *
 * Mirrors `addon-skus.ts`: the source of truth for which price id maps to
 * which tier is the env var, not a column written into git history. The
 * `package_tiers.env_key` row identifies the suffix; the agency prefix is
 * applied at read time.
 *
 * Webhook flow (forward lookup):
 *   resolveTierPriceId(agency, slug | env_key) -> string | null
 *
 * Webhook flow (reverse lookup, price_id from Stripe -> tier id):
 *   resolveTierByPriceId(admin, agency, priceId) -> { id, slug } | null
 *
 * Returning null instead of throwing lets the webhook log a warn-and-skip
 * when a price_id arrives for an unconfigured tier (vs. crashing the whole
 * subscription update path).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgencyBrand } from '@/lib/agency/detect';

function envLookup(agency: AgencyBrand, envKey: string): string | null {
  const prefix = agency === 'anderson' ? 'ANDERSON_' : 'NATIVZ_';
  const direct = process.env[`${prefix}${envKey}`];
  if (direct && direct.trim().length > 0) return direct.trim();
  // Nativz reads a non-prefixed legacy var as a final fallback so single-
  // tenant Nativz deploys can ship without the prefix. (Same convention
  // as resolveAddonPriceId.)
  if (agency === 'nativz') {
    const legacy = process.env[envKey];
    if (legacy && legacy.trim().length > 0) return legacy.trim();
  }
  return null;
}

/**
 * Forward lookup. Pass the env_key suffix as it lives in the DB row.
 * Returns the resolved Stripe price id or null when the env var isn't set.
 */
export function resolveTierPriceIdByEnvKey(
  agency: AgencyBrand,
  envKey: string,
): string | null {
  return envLookup(agency, envKey);
}

interface PackageTierLite {
  id: string;
  slug: string;
  env_key: string | null;
}

/**
 * Reverse lookup used by the Stripe webhook. Reads every active tier for
 * the agency, resolves each one's env-based price id, and returns the
 * matching row. The catalog is small (3 tiers per agency) so the linear
 * scan is fine; we don't need an in-process cache here.
 */
export async function resolveTierByPriceId(
  admin: SupabaseClient,
  agency: AgencyBrand,
  priceId: string,
): Promise<{ id: string; slug: string } | null> {
  const { data: tiers } = await admin
    .from('package_tiers')
    .select('id, slug, env_key')
    .eq('agency', agency)
    .eq('is_active', true)
    .returns<PackageTierLite[]>();
  for (const t of tiers ?? []) {
    if (!t.env_key) continue;
    const resolved = resolveTierPriceIdByEnvKey(agency, t.env_key);
    if (resolved && resolved === priceId) {
      return { id: t.id, slug: t.slug };
    }
  }
  return null;
}
