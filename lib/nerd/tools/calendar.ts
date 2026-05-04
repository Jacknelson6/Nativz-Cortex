import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';

export const calendarTools: ToolDefinition[] = [
  // ── list_calendar_events ──────────────────────────────────────────
  {
    name: 'list_calendar_events',
    description:
      'List upcoming shoot events and show how many calendar connections are active. Returns shoots within the specified number of days ahead.',
    parameters: z.object({
      days_ahead: z.number().optional().default(7),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const { days_ahead = 7 } = params as { days_ahead?: number };

        const now = new Date();
        const futureDate = new Date();
        futureDate.setDate(now.getDate() + days_ahead);

        // Fetch active calendar connections
        const { data: connections, error: connError } = await supabase
          .from('calendar_connections')
          .select('id, connection_type, display_name, is_active')
          .eq('is_active', true);

        if (connError) {
          return { success: false, error: connError.message, cardType: 'calendar' as const };
        }

        // Fetch shoot_events within the date range
        const { data: shoots, error: shootError } = await supabase
          .from('shoot_events')
          .select('*')
          .gte('start_time', now.toISOString())
          .lte('start_time', futureDate.toISOString())
          .order('start_time', { ascending: true });

        if (shootError) {
          return { success: false, error: shootError.message, cardType: 'calendar' as const };
        }

        return {
          success: true,
          data: {
            shoots: shoots ?? [],
            calendarConnectionCount: (connections ?? []).length,
          },
          cardType: 'calendar' as const,
          link: { href: '/admin/availability', label: 'View scheduling' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list calendar events',
          cardType: 'calendar' as const,
        };
      }
    },
  },
];
