/**
 * Overage allowance, does this client get to keep approving past 0?
 *
 * Phase B shipped a hard "no overage" default. Phase D adds a per-client
 * opt-out via `clients.allow_silent_overage`: agencies can flip the column
 * to TRUE for clients where over-delivery is the norm (legacy retainers,
 * unlimited tiers, internal test accounts). Default stays FALSE so new
 * clients see the soft-block pre-approval modal at zero balance.
 *
 * Centralising the rule here means the soft-block + the pre-approval modal
 * + admin shell all read from the same source.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Return true if the client is permitted to approve past zero balance for
 * the given deliverable type. Reads `clients.allow_silent_overage`.
 *
 * The deliverableTypeId param is reserved for Phase D+1 when overage rules
 * become per-(tier, type) instead of per-client. For now it's logged but
 * not consulted, so call sites already pass the right shape.
 */
export async function clientAllowsOverage(
  admin: SupabaseClient,
  clientId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _deliverableTypeId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('clients')
    .select('allow_silent_overage')
    .eq('id', clientId)
    .maybeSingle<{ allow_silent_overage: boolean | null }>();
  return data?.allow_silent_overage === true;
}
