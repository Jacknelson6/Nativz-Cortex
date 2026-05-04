import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceKind } from './service-defaults';

export interface ServiceUsage {
  used: number;
  periodStart: string;
  periodEnd: string;
}

/**
 * Service-to-deliverable-type mapping. The capacity helper speaks in
 * service kinds (editing / smm / blogging) because that's how clients
 * sign packages; the credits ledger speaks in deliverable type slugs
 * (edited_video / ugc_video / static_graphic) because that's how
 * production capacity is consumed. This mapping bridges the two.
 *
 * smm and blogging map to null today because no slug models them yet
 * (smm posts are tracked outside the credits ledger via Zernio).
 */
const SERVICE_TO_DELIVERABLE_SLUG: Record<ServiceKind, string | null> = {
  editing: 'edited_video',
  smm: null,
  blogging: null,
};

function currentPeriodBoundsUTC(now = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Counts deliverables consumed this calendar month for a client.
 *
 * "Consumed" = a credit_transactions row of kind='consume' targeting the
 * deliverable_type_id that the requested service maps to. Refunds inside
 * the same period decrement the count (consume + refund pairs net to
 * zero, mirroring the ledger's true balance impact).
 *
 * Returns 0 used when the service has no deliverable mapping (smm /
 * blogging today). Callers can render that as "tracked elsewhere"
 * rather than "0 of N used".
 */
export async function getClientServiceUsage(
  supabase: SupabaseClient,
  clientId: string,
  service: ServiceKind,
): Promise<ServiceUsage> {
  const { start, end } = currentPeriodBoundsUTC();
  const periodStart = start.slice(0, 10);
  const periodEnd = end.slice(0, 10);

  const slug = SERVICE_TO_DELIVERABLE_SLUG[service];
  if (!slug) {
    return { used: 0, periodStart, periodEnd };
  }

  const { data: type } = await supabase
    .from('deliverable_types')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (!type?.id) {
    return { used: 0, periodStart, periodEnd };
  }

  const { data: rows } = await supabase
    .from('credit_transactions')
    .select('kind, delta')
    .eq('client_id', clientId)
    .eq('deliverable_type_id', type.id)
    .in('kind', ['consume', 'refund'])
    .gte('created_at', start)
    .lt('created_at', end);

  let used = 0;
  for (const row of rows ?? []) {
    const delta = (row as { delta?: number }).delta ?? 0;
    if ((row as { kind: string }).kind === 'consume') used += Math.abs(delta);
    else if ((row as { kind: string }).kind === 'refund') used -= Math.abs(delta);
  }
  return { used: Math.max(0, used), periodStart, periodEnd };
}
