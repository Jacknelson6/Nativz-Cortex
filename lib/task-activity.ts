import { createAdminClient } from '@/lib/supabase/admin';

export async function recordTaskActivity(params: {
  taskId: string;
  userId: string;
  action: string;
  details?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from('task_activity').insert({
    task_id: params.taskId,
    user_id: params.userId,
    action: params.action,
    details: params.details ?? {},
  });
  if (error) console.error('Failed to record task activity:', error);
}
