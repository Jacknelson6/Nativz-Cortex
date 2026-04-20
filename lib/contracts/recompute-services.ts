import { createAdminClient } from '@/lib/supabase/admin';

export interface DeliverableRow {
  status: 'draft' | 'active' | 'ended';
  service_tag: string;
}

export function computeServicesFromRows(rows: DeliverableRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.status !== 'active') continue;
    const trimmed = (r.service_tag ?? '').trim();
    if (trimmed) set.add(trimmed);
  }
  return Array.from(set).sort();
}

/**
 * Recompute clients.services as the union of service_tags across all active
 * contracts for the given client. Writes back to clients.services. Any other
 * writer of clients.services should be audited and removed.
 */
export async function recomputeClientServices(clientId: string): Promise<string[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('client_contract_deliverables')
    .select('service_tag, client_contracts!inner(status, client_id)')
    .eq('client_contracts.client_id', clientId);

  if (error) throw error;

  const rows: DeliverableRow[] = (data ?? []).map((row) => {
    const contract = (row as { client_contracts: { status: string } }).client_contracts;
    return {
      status: contract.status as DeliverableRow['status'],
      service_tag: (row as { service_tag: string }).service_tag,
    };
  });

  const services = computeServicesFromRows(rows);

  const { error: updateErr } = await admin
    .from('clients')
    .update({ services })
    .eq('id', clientId);
  if (updateErr) throw updateErr;

  return services;
}
