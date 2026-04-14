import type { SupabaseClient } from '@supabase/supabase-js';
import type { MergeContext } from '@/lib/email/types';

export interface RecipientRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

export interface SenderRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

/**
 * Pull the merge context for one recipient. `client.name` is populated only when
 * the recipient has exactly one user_client_access row (zero or many → null so we
 * don't pick arbitrarily).
 */
export async function resolveMergeContext(
  admin: SupabaseClient,
  recipient: RecipientRow,
  sender: SenderRow,
): Promise<MergeContext> {
  const { data: access } = await admin
    .from('user_client_access')
    .select('client_id, clients(name)')
    .eq('user_id', recipient.id);

  let clientName: string | null = null;
  if (Array.isArray(access) && access.length === 1) {
    const rel = access[0] as { clients: { name: string | null } | { name: string | null }[] | null };
    const clients = rel.clients;
    if (Array.isArray(clients)) clientName = clients[0]?.name ?? null;
    else clientName = clients?.name ?? null;
  }

  return {
    recipient: { full_name: recipient.full_name, email: recipient.email },
    sender: { full_name: sender.full_name, email: sender.email },
    client: { name: clientName },
  };
}
