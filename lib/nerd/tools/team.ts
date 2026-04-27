import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';

export const teamTools: ToolDefinition[] = [
  // ── list_team_members ─────────────────────────────────────────────
  {
    name: 'list_team_members',
    description:
      'List all active team members ordered by name.',
    parameters: z.object({}),
    riskLevel: 'read',
    handler: async () => {
      try {
        const supabase = createAdminClient();

        const { data, error } = await supabase
          .from('team_members')
          .select('id, full_name, email, role, avatar_url, is_active')
          .eq('is_active', true)
          .order('full_name', { ascending: true });

        if (error) {
          return { success: false, error: error.message, cardType: 'team' as const };
        }

        return {
          success: true,
          data: data ?? [],
          cardType: 'team' as const,
          link: { href: '/admin/users', label: 'View team' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list team members',
          cardType: 'team' as const,
        };
      }
    },
  },

  // ── get_team_member_workload ──────────────────────────────────────
  {
    name: 'get_team_member_workload',
    description:
      "Get a team member's client assignments.",
    parameters: z.object({
      team_member_id: z.string(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const { team_member_id } = params as { team_member_id: string };

        const [memberResult, assignmentsResult] = await Promise.all([
          supabase
            .from('team_members')
            .select('id, full_name, email, role, avatar_url, is_active')
            .eq('id', team_member_id)
            .single(),
          supabase
            .from('client_assignments')
            .select('id, role, clients:client_id(id, name)')
            .eq('team_member_id', team_member_id),
        ]);

        if (memberResult.error) {
          return {
            success: false,
            error: `Team member not found: ${memberResult.error.message}`,
            cardType: 'team' as const,
          };
        }

        if (assignmentsResult.error) {
          return { success: false, error: assignmentsResult.error.message, cardType: 'team' as const };
        }

        const clientAssignments = (assignmentsResult.data ?? []).map((a) => {
          const client = a.clients as unknown as { id: string; name: string } | null;
          return {
            id: a.id,
            role: a.role,
            client_id: client?.id ?? null,
            client_name: client?.name ?? null,
          };
        });

        return {
          success: true,
          data: {
            member: memberResult.data,
            clientAssignments,
          },
          cardType: 'team' as const,
          link: { href: '/admin/users', label: 'View team' },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to get team member workload',
          cardType: 'team' as const,
        };
      }
    },
  },
];
