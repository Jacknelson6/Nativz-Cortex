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
        'The full plan body. Every idea has a title and should carry audience/sentiment/resonance when the attached research supports it. Skip a stat rather than inventing one. Do NOT include client_id or topic_search_ids inside this plan object — those go on the wrapper.',
      ),
      // Permissive: accept any strings so the Nerd doesn't fail the call when
      // it confuses query labels for IDs. We filter to UUIDs before insert.
      topic_search_ids: z.array(z.string()).max(10).optional().describe(
        'UUIDs of the topic_searches this plan was built from, for traceability. Only include actual UUIDs you can see in the attached research blocks — otherwise leave empty.',
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

      // Strip non-UUID strings out of topic_search_ids so a Nerd hallucination
      // (passing the search query name instead of the UUID) doesn't fail the
      // insert against the uuid[] column type.
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const cleanTopicSearchIds = (topic_search_ids ?? []).filter((s) => uuidRe.test(s));

      const admin = createAdminClient();
      const { data: client } = await admin
        .from('clients')
        .select('id, name, organization_id')
        .eq('id', client_id)
        .single();
      if (!client) {
        return { success: false, error: 'Client not found', cardType: 'topic_plan' as const };
      }

      // The Nerd sometimes hallucinates a conversation_id (or passes one from
      // a thread that doesn't exist yet). Verify the row exists before we
      // hand it to the FK constraint — null it out otherwise so the insert
      // succeeds rather than 500ing the whole tool call.
      let safeConversationId: string | null = null;
      if (conversation_id && uuidRe.test(conversation_id)) {
        const { data: convo } = await admin
          .from('nerd_conversations')
          .select('id')
          .eq('id', conversation_id)
          .maybeSingle();
        if (convo) safeConversationId = convo.id;
      }

      const { data: plansRow, error } = await admin
        .from('topic_plans')
        .insert({
          client_id: client.id,
          organization_id: client.organization_id,
          title: plan.title,
          subtitle: plan.subtitle ?? null,
          plan_json: plan,
          topic_search_ids: cleanTopicSearchIds,
          conversation_id: safeConversationId,
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
