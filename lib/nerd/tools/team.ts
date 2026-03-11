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
          link: { href: '/admin/team', label: 'View team' },
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
      'Get a team member\'s current workload including their active tasks and client assignments.',
    parameters: z.object({
      team_member_id: z.string(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const supabase = createAdminClient();
        const { team_member_id } = params as { team_member_id: string };

        // Fetch the team member
        const { data: member, error: memberError } = await supabase
          .from('team_members')
          .select('id, full_name, email, role, avatar_url, is_active')
          .eq('id', team_member_id)
          .single();

        if (memberError) {
          return {
            success: false,
            error: `Team member not found: ${memberError.message}`,
            cardType: 'team' as const,
          };
        }

        // Fetch active tasks assigned to this member (not archived, not done)
        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, title, status, priority, task_type, due_date, client_id')
          .eq('assignee_id', team_member_id)
          .is('archived_at', null)
          .neq('status', 'done')
          .order('created_at', { ascending: false });

        if (tasksError) {
          return { success: false, error: tasksError.message, cardType: 'team' as const };
        }

        // Fetch client assignments with client names
        const { data: assignments, error: assignError } = await supabase
          .from('client_assignments')
          .select('id, role, clients:client_id(id, name)')
          .eq('team_member_id', team_member_id);

        if (assignError) {
          return { success: false, error: assignError.message, cardType: 'team' as const };
        }

        const clientAssignments = (assignments ?? []).map((a) => {
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
            member,
            tasks: tasks ?? [],
            clientAssignments,
          },
          cardType: 'team' as const,
          link: { href: '/admin/team', label: 'View team' },
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
