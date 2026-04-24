import type { SupabaseClient } from '@supabase/supabase-js';

export type NotificationType =
  | 'payment_received'
  | 'invoice_overdue'
  | 'invoice_sent'
  | 'invoice_due_soon'
  | 'contract_signed'
  | 'subscription_created'
  | 'subscription_canceled'
  | 'subscription_paused'
  | 'subscription_resumed'
  | 'subscription_updated'
  | 'proposal_expiring'
  | 'revenue_anomaly';

/**
 * Fan out a single notification to every admin user (role in admin/super_admin
 * or is_super_admin=true). No-op when there are no admins. Safe to call from
 * any context — caller does not need to wait on the result for correctness.
 */
export async function notifyAdmins(
  admin: SupabaseClient,
  type: NotificationType,
  title: string,
  opts: { message?: string; taskId?: string | null } = {},
): Promise<void> {
  const { data: admins } = await admin
    .from('users')
    .select('id')
    .or('role.eq.admin,role.eq.super_admin,is_super_admin.eq.true');
  if (!admins?.length) return;
  const rows = admins.map((u) => ({
    user_id: u.id,
    type,
    title,
    message: opts.message ?? null,
    task_id: opts.taskId ?? null,
    read: false,
  }));
  const { error } = await admin.from('notifications').insert(rows);
  if (error) console.error('[notify] admin fan-out failed:', error.message);
}
