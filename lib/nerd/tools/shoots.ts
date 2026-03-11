import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';

export const shootTools: ToolDefinition[] = [
  // ── list_shoots ─────────────────────────────────────────────
  {
    name: 'list_shoots',
    description:
      'List upcoming or past shoots with optional filters by client, date range, or limit. Returns shoots ordered by date ascending.',
    parameters: z.object({
      client_id: z.string().uuid().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      limit: z.number().default(10),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();

        let query = supabase
          .from('shoot_events')
          .select('*, clients:client_id(id, name, slug)')
          .order('shoot_date', { ascending: true })
          .limit((params.limit as number) ?? 10);

        if (params.client_id) {
          query = query.eq('client_id', params.client_id as string);
        }
        if (params.date_from) {
          query = query.gte('shoot_date', params.date_from as string);
        }
        if (params.date_to) {
          query = query.lte('shoot_date', params.date_to as string);
        }

        const { data, error } = await query;

        if (error) {
          return { success: false, error: error.message };
        }

        const shoots = (data ?? []).map((s) => {
          const client = s.clients as { id: string; name: string; slug: string } | null;
          return {
            id: s.id,
            title: s.title,
            shoot_date: s.shoot_date,
            location: s.location,
            notes: s.notes,
            plan_status: s.plan_status,
            scheduled_status: s.scheduled_status,
            client_id: s.client_id,
            client_name: client?.name ?? null,
            client_slug: client?.slug ?? null,
            created_by: s.created_by,
          };
        });

        return {
          success: true,
          data: shoots,
          cardType: 'shoot' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list shoots',
        };
      }
    },
  },

  // ── create_shoot ────────────────────────────────────────────
  {
    name: 'create_shoot',
    description:
      'Create a new shoot event. One row is inserted per client_id so a single shoot can span multiple clients.',
    parameters: z.object({
      title: z.string(),
      shoot_date: z.string(),
      client_ids: z.array(z.string().uuid()).min(1),
      location: z.string().optional(),
      notes: z.string().optional(),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const supabase = createAdminClient();

        const clientIds = params.client_ids as string[];
        const rows = clientIds.map((client_id) => ({
          title: params.title as string,
          shoot_date: params.shoot_date as string,
          location: (params.location as string) ?? null,
          notes: (params.notes as string) ?? null,
          client_id,
          plan_status: 'pending' as const,
          created_by: userId,
        }));

        const { data, error } = await supabase
          .from('shoot_events')
          .insert(rows)
          .select('*, clients:client_id(id, name, slug)');

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          data: data ?? [],
          link: { href: '/admin/shoots', label: 'View shoots' },
          cardType: 'shoot' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create shoot',
        };
      }
    },
  },

  // ── reschedule_shoot ────────────────────────────────────────
  {
    name: 'reschedule_shoot',
    description:
      'Reschedule an existing shoot to a new date and optionally update the location.',
    parameters: z.object({
      shoot_id: z.string().uuid(),
      shoot_date: z.string(),
      location: z.string().optional(),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const shootId = params.shoot_id as string;

        const updates: Record<string, unknown> = {
          shoot_date: params.shoot_date as string,
        };

        if (params.location !== undefined) {
          updates.location = params.location as string;
        }

        const { data, error } = await supabase
          .from('shoot_events')
          .update(updates)
          .eq('id', shootId)
          .select('*, clients:client_id(id, name, slug)')
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          data,
          cardType: 'shoot' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to reschedule shoot',
        };
      }
    },
  },
];
