import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';

export const searchTools: ToolDefinition[] = [
  // ── run_topic_search ────────────────────────────────────────
  {
    name: 'run_topic_search',
    description:
      'Start a new topic search. Creates the record with status "processing" — actual processing happens separately via /api/search/[id]/process. Returns the search id and a link to view results.',
    parameters: z.object({
      query: z.string(),
      client_id: z.string().uuid().optional(),
      search_mode: z.enum(['general', 'client_strategy']).default('general'),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const supabase = createAdminClient();

        const { data, error } = await supabase
          .from('topic_searches')
          .insert({
            query: params.query as string,
            client_id: (params.client_id as string) ?? null,
            search_mode: (params.search_mode as string) ?? 'general',
            source: 'all',
            time_range: 'last_3_months',
            language: 'all',
            country: 'us',
            status: 'processing',
            created_by: userId,
          })
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          data: { id: data.id },
          link: { href: `/admin/finder/${data.id}`, label: 'View search' },
          cardType: 'search' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create topic search',
        };
      }
    },
  },

  // ── get_search_results ──────────────────────────────────────
  {
    name: 'get_search_results',
    description:
      'Fetch a topic search record by id, including its results. Useful for checking if a search has completed and reading the findings.',
    parameters: z.object({
      search_id: z.string().uuid(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const searchId = params.search_id as string;

        const { data, error } = await supabase
          .from('topic_searches')
          .select('*')
          .eq('id', searchId)
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          data,
          link: { href: `/admin/finder/${data.id}`, label: 'View search' },
          cardType: 'search' as const,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to fetch search results',
        };
      }
    },
  },
];
