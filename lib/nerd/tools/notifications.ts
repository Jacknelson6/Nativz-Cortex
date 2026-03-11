import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';

export const notificationTools: ToolDefinition[] = [
  // ── list_notifications ────────────────────────────────────────────
  {
    name: 'list_notifications',
    description:
      'List notifications for the current user. Defaults to unread only. Returns up to 20 notifications ordered by newest first.',
    parameters: z.object({
      unread_only: z.boolean().optional().default(true),
    }),
    riskLevel: 'read',
    handler: async (params, userId) => {
      try {
        const supabase = createAdminClient();
        const { unread_only = true } = params as { unread_only?: boolean };

        let query = supabase
          .from('notifications')
          .select('id, recipient_user_id, type, title, is_read, created_at, task_id')
          .eq('recipient_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (unread_only) {
          query = query.eq('is_read', false);
        }

        const { data, error } = await query;

        if (error) {
          return { success: false, error: error.message, cardType: 'notification' as const };
        }

        return {
          success: true,
          data: data ?? [],
          cardType: 'notification' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list notifications',
          cardType: 'notification' as const,
        };
      }
    },
  },

  // ── mark_notifications_read ───────────────────────────────────────
  {
    name: 'mark_notifications_read',
    description:
      'Mark notifications as read. If specific IDs are provided, only those are marked. Otherwise all unread notifications for the current user are marked as read.',
    parameters: z.object({
      notification_ids: z.array(z.string()).optional(),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const supabase = createAdminClient();
        const { notification_ids } = params as { notification_ids?: string[] };

        let query = supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('recipient_user_id', userId)
          .eq('is_read', false);

        if (notification_ids && notification_ids.length > 0) {
          query = query.in('id', notification_ids);
        }

        const { data, error } = await query.select();

        if (error) {
          return { success: false, error: error.message, cardType: 'notification' as const };
        }

        return {
          success: true,
          data: { count: (data ?? []).length },
          cardType: 'notification' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to mark notifications as read',
          cardType: 'notification' as const,
        };
      }
    },
  },
];
