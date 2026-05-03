/**
 * Overage allowance — does this client get to keep approving past 0?
 *
 * Phase B ships a hard "no overage" default: when the per-type balance hits
 * zero and there's no add-on available, the soft-block fires and the client
 * is gated until they purchase an add-on or cross into next month's reset.
 *
 * Phase D introduces `package_tiers` as a first-class entity, at which point
 * this helper grows into a tier lookup ("Studio tier permits 2 over",
 * "Full Social permits unlimited with retainer billing"). The signature
 * already takes a clientId so the call sites don't change.
 *
 * Centralising the rule here means the soft-block + the future pre-approval
 * modal + admin shell all read from the same source.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Return true if the client is permitted to approve past zero balance for
 * the given deliverable type. Phase B: always false. Phase D: tier-aware.
 */
export async function clientAllowsOverage(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _admin: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _clientId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _deliverableTypeId: string,
): Promise<boolean> {
  return false;
}
