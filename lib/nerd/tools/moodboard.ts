import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';

export const moodboardTools: ToolDefinition[] = [
  // ── list_moodboards ───────────────────────────────────────────────
  {
    name: 'list_moodboards',
    description:
      'List moodboard boards, optionally filtered by client. Returns up to 20 boards ordered by most recently updated.',
    parameters: z.object({
      client_id: z.string().optional(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const { client_id } = params as { client_id?: string };

        let query = supabase
          .from('moodboard_boards')
          .select('id, name, description, client_id, created_by, updated_at, clients:client_id(id, name)')
          .is('archived_at', null)
          .order('updated_at', { ascending: false })
          .limit(20);

        if (client_id) {
          query = query.eq('client_id', client_id);
        }

        const { data: boards, error } = await query;

        if (error) {
          return { success: false, error: error.message, cardType: 'moodboard' as const };
        }

        // Get item counts per board
        const boardIds = (boards ?? []).map((b) => b.id);
        let itemCounts: Record<string, number> = {};

        if (boardIds.length > 0) {
          const { data: counts, error: countError } = await supabase
            .from('moodboard_items')
            .select('board_id')
            .in('board_id', boardIds);

          if (!countError && counts) {
            itemCounts = counts.reduce(
              (acc, item) => {
                acc[item.board_id] = (acc[item.board_id] ?? 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            );
          }
        }

        const result = (boards ?? []).map((b) => {
          const client = b.clients as unknown as { id: string; name: string } | null;
          return {
            id: b.id,
            name: b.name,
            description: b.description,
            client_id: b.client_id,
            client_name: client?.name ?? null,
            created_by: b.created_by,
            updated_at: b.updated_at,
            item_count: itemCounts[b.id] ?? 0,
          };
        });

        return {
          success: true,
          data: result,
          cardType: 'moodboard' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list moodboards',
          cardType: 'moodboard' as const,
        };
      }
    },
  },

  // ── get_moodboard_items ───────────────────────────────────────────
  {
    name: 'get_moodboard_items',
    description:
      'Get all items on a specific moodboard, ordered by creation date.',
    parameters: z.object({
      board_id: z.string(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const { board_id } = params as { board_id: string };

        const { data: items, error } = await supabase
          .from('moodboard_items')
          .select('id, board_id, type, url, title, thumbnail_url')
          .eq('board_id', board_id)
          .order('created_at', { ascending: true });

        if (error) {
          return { success: false, error: error.message, cardType: 'moodboard' as const };
        }

        return {
          success: true,
          data: items ?? [],
          cardType: 'moodboard' as const,
          link: { href: `/admin/moodboard/${board_id}`, label: 'View moodboard' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to get moodboard items',
          cardType: 'moodboard' as const,
        };
      }
    },
  },
];
