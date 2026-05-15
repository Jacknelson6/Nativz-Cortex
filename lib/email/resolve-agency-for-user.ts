/**
 * Resolve which agency a user-targeted email should be branded under.
 *
 * Post-Victory incident hardening: an admin emailing an AC client from
 * the Nativz host used to ship Nativz-branded mail because the only
 * source of agency was `detectAgencyFromHostname(request)`. That picked
 * up "where is the admin sitting" instead of "who is the recipient."
 *
 * Priority order:
 *   1. The recipient's client.agency (via users.organization_id → the
 *      one client in that org with matching slug). This is the only
 *      source the recipient sees, so it's also the one we trust.
 *   2. The request hostname, as the fall-through for users with no
 *      organization (Nativz internal team, system notifications).
 *
 * The function never throws; an unrecognized agency string on the
 * client row falls back to hostname detection so a malformed row
 * doesn't take a route 500.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { detectAgencyFromHostname, getBrandFromAgency } from '@/lib/agency/detect';
import type { AgencyBrand } from '@/lib/agency/detect';

interface ResolveOptions {
  /** Recipient user row id. */
  userId: string;
  /** Request hostname (`request.headers.get('host')`) for fall-through. */
  hostname: string;
}

export async function resolveAgencyForUser(
  admin: SupabaseClient,
  opts: ResolveOptions,
): Promise<AgencyBrand> {
  const hostFallback = detectAgencyFromHostname(opts.hostname || '');

  const { data: user } = await admin
    .from('users')
    .select('organization_id')
    .eq('id', opts.userId)
    .maybeSingle();

  const orgId = (user as { organization_id?: string | null } | null)?.organization_id;
  if (!orgId) return hostFallback;

  // Org-scoped clients all share the same agency, so the first one is
  // representative. Two-clients-one-org with split agencies would be a
  // schema violation, not a real case.
  const { data: client } = await admin
    .from('clients')
    .select('agency')
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle();

  const agencyValue = (client as { agency?: string | null } | null)?.agency;
  if (!agencyValue) return hostFallback;

  try {
    return getBrandFromAgency(agencyValue);
  } catch {
    // Bad agency string on the row — fall back to hostname instead of
    // 500-ing the whole send.
    return hostFallback;
  }
}
