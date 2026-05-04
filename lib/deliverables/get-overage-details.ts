import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceKind } from '@/lib/clients/service-defaults';

export interface OverScopeRow {
  id: string;
  approvedAt: string;
  editorName: string;
  /**
   * 1-indexed position in the calendar month's chronological consume sequence.
   * Rows where `index > capacity` are the ones over scope.
   */
  index: number;
}

const SERVICE_TO_DELIVERABLE_SLUG: Record<ServiceKind, string | null> = {
  editing: 'edited_video',
  smm: null,
  blogging: null,
};

/**
 * Returns the credit_transactions consume rows in the calendar month
 * containing `referenceDate`, with their 1-indexed position. Callers compare
 * `index > capacity` to identify the over-scope subset for the dialog list.
 *
 * Refunds are NOT subtracted here on purpose - we want to show every approved
 * deliverable that contributed to the over-scope event. Net usage is
 * elsewhere (see lib/clients/get-service-usage.ts).
 *
 * Editor name resolves via:
 *   credit_transactions.editor_user_id -> team_members.user_id -> full_name
 *   then auth.users.email as a final fallback, then "Unattributed".
 */
export async function getOverageDetails(
  supabase: SupabaseClient,
  clientId: string,
  service: ServiceKind,
  referenceDate: Date,
): Promise<OverScopeRow[]> {
  const slug = SERVICE_TO_DELIVERABLE_SLUG[service];
  if (!slug) return [];

  const start = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1),
  );

  const { data: type } = await supabase
    .from('deliverable_types')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (!type?.id) return [];

  const { data: rows } = await supabase
    .from('credit_transactions')
    .select('id, created_at, editor_user_id')
    .eq('client_id', clientId)
    .eq('deliverable_type_id', type.id)
    .eq('kind', 'consume')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: true });

  const editorIds = Array.from(
    new Set((rows ?? []).map((r) => (r as { editor_user_id?: string | null }).editor_user_id).filter(Boolean) as string[]),
  );

  const editorNameById = new Map<string, string>();
  if (editorIds.length) {
    const { data: members } = await supabase
      .from('team_members')
      .select('user_id, full_name')
      .in('user_id', editorIds);
    for (const m of members ?? []) {
      const userId = (m as { user_id: string | null }).user_id;
      const name = (m as { full_name: string | null }).full_name;
      if (userId && name) editorNameById.set(userId, name);
    }
  }

  return (rows ?? []).map((row, idx) => {
    const editorId = (row as { editor_user_id?: string | null }).editor_user_id ?? null;
    const editorName = editorId ? editorNameById.get(editorId) ?? 'Unattributed' : 'Unattributed';
    return {
      id: (row as { id: string }).id,
      approvedAt: (row as { created_at: string }).created_at,
      editorName,
      index: idx + 1,
    };
  });
}
