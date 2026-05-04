import type { SupabaseClient } from '@supabase/supabase-js';
import { getClientServiceCapacity } from '@/lib/clients/get-service-capacity';

export interface PeriodOverScopeClient {
  clientId: string;
  clientName: string;
  service: 'editing';
  monthly: number;
  delivered: number;
  overCount: number;
}

/**
 * Per-client over-scope summary for the editing tab of an accounting period.
 *
 * Walks the unique client_ids that appear in this period's editing payroll
 * rows, asks each one for its calendar-month editing capacity, and returns
 * only the ones where delivered > capacity. Used by the period detail page
 * to render an "over scope this period" pill row above the editing grid.
 *
 * Capacity is calendar-month based, the period is bi-monthly. That's
 * intentional: the over-scope decision lives at the calendar-month level
 * so a half-period split doesn't double-flag.
 */
export async function getEditingOverScopeForPeriod(
  supabase: SupabaseClient,
  periodId: string,
): Promise<PeriodOverScopeClient[]> {
  const { data: rows } = await supabase
    .from('payroll_entries')
    .select('client_id')
    .eq('period_id', periodId)
    .eq('entry_type', 'editing')
    .not('client_id', 'is', null);

  const clientIds = Array.from(
    new Set((rows ?? []).map((r) => r.client_id as string).filter(Boolean)),
  );
  if (clientIds.length === 0) return [];

  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name')
    .in('id', clientIds);
  const nameById = new Map<string, string>(
    (clientRows ?? []).map((c) => [c.id as string, (c.name as string) ?? 'Unknown']),
  );

  const capacities = await Promise.all(
    clientIds.map((id) => getClientServiceCapacity(supabase, id)),
  );

  const out: PeriodOverScopeClient[] = [];
  for (const cap of capacities) {
    const editing = cap.editing;
    if (editing.source === 'not-subscribed') continue;
    if (editing.monthly <= 0) continue;
    if (editing.delivered <= editing.monthly) continue;
    out.push({
      clientId: cap.clientId,
      clientName: nameById.get(cap.clientId) ?? 'Unknown',
      service: 'editing',
      monthly: editing.monthly,
      delivered: editing.delivered,
      overCount: editing.delivered - editing.monthly,
    });
  }
  return out.sort((a, b) => b.overCount - a.overCount);
}
