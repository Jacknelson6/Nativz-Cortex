/**
 * GET /api/deliverables/[clientId]/tiers
 *
 * Returns the active package_tiers catalog for the client's agency, plus
 * the client's currently-assigned tier id (or null). Admin-only: portal
 * viewers don't see tier comparison surfaces.
 *
 * Shape:
 *   {
 *     tiers: TierCardData[],
 *     currentTierId: string | null,
 *     agency: 'nativz' | 'anderson'
 *   }
 *
 * `currentTierId` is the most-common `package_tier_id` across the client's
 * `client_credit_balances` rows; if the client has multiple types pointing
 * at different tiers (legacy state), we surface the most-common id and the
 * tier picker UI can warn about the mismatch.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCreditsAdminContext } from '@/lib/credits/admin-auth';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getTierCatalog } from '@/lib/deliverables/get-tier-catalog';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    return NextResponse.json({ error: 'Invalid clientId' }, { status: 400 });
  }

  const auth = await getCreditsAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();

  const [clientResult, balancesResult] = await Promise.all([
    admin
      .from('clients')
      .select('agency')
      .eq('id', clientId)
      .maybeSingle<{ agency: string | null }>(),
    admin
      .from('client_credit_balances')
      .select('package_tier_id')
      .eq('client_id', clientId)
      .returns<Array<{ package_tier_id: string | null }>>(),
  ]);

  if (clientResult.error || !clientResult.data) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const agency = getBrandFromAgency(clientResult.data.agency);

  // Most-common tier id among the per-type rows. Ties resolve to the first
  // tier seen in the balance-row scan, which is fine: any mismatched legacy
  // state is recoverable by re-applying the chosen tier.
  const counts = new Map<string, number>();
  for (const row of balancesResult.data ?? []) {
    if (!row.package_tier_id) continue;
    counts.set(row.package_tier_id, (counts.get(row.package_tier_id) ?? 0) + 1);
  }
  let currentTierId: string | null = null;
  let bestCount = 0;
  for (const [id, n] of counts) {
    if (n > bestCount) {
      currentTierId = id;
      bestCount = n;
    }
  }

  const tiers = await getTierCatalog(admin, agency);

  return NextResponse.json({ tiers, currentTierId, agency });
}

// Disable Next's static optimization so admin reads always hit live data.
export const dynamic = 'force-dynamic';
