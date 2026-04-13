import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { topicPlanSchema } from '@/lib/topic-plans/types';

/**
 * create_topic_plan — the Nerd's artifact-producing tool.
 *
 * Used when the user asks for a video idea list, topic plan, or content
 * calendar. Instead of dumping the ideas as prose, the Nerd packages them
 * as structured JSON matching TopicPlan and calls this tool. We persist
 * and return a download URL; the chat surface renders an artifact card
 * with a "Download .docx" button.
 */
export const topicPlanTools: ToolDefinition[] = [
  {
    name: 'create_topic_plan',
    description:
      'Produce a client-ready topic plan artifact (a video idea deliverable with series, per-topic cards, resonance tags, and YES/MAYBE/NO checkboxes). Call this instead of returning a bulleted idea list in chat when the user asks for a topic plan, idea list, or content calendar. The plan downloads as a .docx file formatted for client review. Always group ideas into at least one "series" even if the plan is a single bucket. Ground every idea in the attached research — audience, positive_pct, negative_pct, and resonance should be derived from the topic_searches the user has attached (metrics / trending_topics / emotions JSONB).',
    parameters: z.object({
      client_id: z.string().uuid().describe('UUID of the client this plan is for'),
      plan: topicPlanSchema.describe(
        'The full plan body. Every idea has a title and should carry audience/sentiment/resonance when the attached research supports it. Skip a stat rather than inventing one.',
      ),
      topic_search_ids: z.array(z.string().uuid()).max(10).optional().describe(
        'IDs of the topic_searches this plan was built from, for traceability',
      ),
      conversation_id: z.string().uuid().optional().describe(
        'Nerd conversation this plan was produced in (optional)',
      ),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      const { client_id, plan, topic_search_ids, conversation_id } = params as {
        client_id: string;
        plan: z.infer<typeof topicPlanSchema>;
        topic_search_ids?: string[];
        conversation_id?: string;
      };

      const admin = createAdminClient();
      const { data: client } = await admin
        .from('clients')
        .select('id, name, organization_id')
        .eq('id', client_id)
        .single();
      if (!client) {
        return { success: false, error: 'Client not found', cardType: 'topic_plan' as const };
      }

      const { data: plansRow, error } = await admin
        .from('topic_plans')
        .insert({
          client_id: client.id,
          organization_id: client.organization_id,
          title: plan.title,
          subtitle: plan.subtitle ?? null,
          plan_json: plan,
          topic_search_ids: topic_search_ids ?? [],
          conversation_id: conversation_id ?? null,
          created_by: userId,
        })
        .select('id, title, subtitle, created_at')
        .single();

      if (error || !plansRow) {
        return {
          success: false,
          error: error?.message ?? 'Failed to save topic plan',
          cardType: 'topic_plan' as const,
        };
      }

      const totalIdeas = plan.series.reduce((sum, s) => sum + s.ideas.length, 0);
      const highResonance = plan.series.reduce(
        (sum, s) => sum + s.ideas.filter((i) => i.resonance === 'high').length,
        0,
      );

      return {
        success: true,
        cardType: 'topic_plan' as const,
        data: {
          id: plansRow.id,
          title: plansRow.title,
          subtitle: plansRow.subtitle,
          client_id: client.id,
          client_name: client.name,
          series_count: plan.series.length,
          total_ideas: totalIdeas,
          high_resonance_count: highResonance,
          download_url: `/api/topic-plans/${plansRow.id}/docx`,
          created_at: plansRow.created_at,
        },
        link: {
          href: `/api/topic-plans/${plansRow.id}/docx`,
          label: 'Download .docx',
        },
      };
    },
  },
];
