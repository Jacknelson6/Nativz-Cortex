import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { topicPlanSchema } from '@/lib/topic-plans/types';
import { loadTopicSignals, matchSignal } from '@/lib/topic-plans/signals';

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

      // Role + org scoping. Viewers can only create plans for clients their
      // org has access to; admins can create for any client.
      const { data: me } = await admin
        .from('users')
        .select('role, organization_id')
        .eq('id', userId)
        .single();
      if (!me) {
        return { success: false, error: 'User not found', cardType: 'topic_plan' as const };
      }
      if (me.role !== 'admin') {
        if (!me.organization_id || client.organization_id !== me.organization_id) {
          return {
            success: false,
            error: 'You do not have access to this client.',
            cardType: 'topic_plan' as const,
          };
        }
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

      // ─── Server-side grounding: enrich + validate each idea against the
      // actual research. The Nerd's ideas SHOULD have a `source` matching a
      // real trending topic; we look it up, fill in the stat fields from the
      // matched signal (overwriting any guess), and track how grounded the
      // overall plan is. If too few ideas are traceable to real signals, we
      // reject so the model has to retry — instead of silently shipping a
      // made-up plan.
      let groundedIdeas = 0;
      let totalIdeasCount = 0;
      if (cleanTopicSearchIds.length > 0) {
        const signals = await loadTopicSignals(cleanTopicSearchIds);
        if (signals.length > 0) {
          for (const series of plan.series) {
            for (const idea of series.ideas) {
              totalIdeasCount += 1;
              const match = matchSignal(idea.source, signals);
              if (match) {
                groundedIdeas += 1;
                // Canonicalize the source name to the real trending topic so
                // the PDF reads consistently across ideas pointing at the
                // same signal.
                idea.source = match.topic_name;
                // Pull real stats — only overwrite when the signal has data
                // and the idea field is missing, so the Nerd can still pass
                // a more specific number if it has one.
                if (idea.audience == null && match.search_audience != null) {
                  idea.audience = match.search_audience;
                }
                if (idea.positive_pct == null && match.positive_pct != null) {
                  idea.positive_pct = match.positive_pct;
                }
                if (idea.negative_pct == null && match.negative_pct != null) {
                  idea.negative_pct = match.negative_pct;
                }
                // Resonance: the search's own bucket wins over the Nerd's
                // guess — the model loves "viral" / "high" without basis.
                if (match.resonance) {
                  idea.resonance = match.resonance;
                }
              } else if (idea.source) {
                // Source provided but not in the research — drop it rather
                // than render a fabricated provenance label on the PDF.
                idea.source = undefined;
              }
            }
          }

          // Reject only when the Nerd had rich signals available and still
          // produced zero grounded ideas — real failure mode (probably
          // fabricated source labels). When grounding is thin but non-zero,
          // accept the plan; the user can see signal-tagged ideas for the
          // ones that matched and brand-DNA-derived ideas for the rest,
          // instead of getting no PDF at all.
          if (totalIdeasCount > 0 && groundedIdeas === 0 && signals.length >= 5) {
            return {
              success: false,
              error: `You had ${signals.length} trending topics available from the attached searches but none of the ${totalIdeasCount} ideas set a "source" matching any of them. Set each idea's "source" to a real topic_name from extract_topic_signals' output, then retry.`,
              cardType: 'topic_plan' as const,
            };
          }
        }
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
          download_url: `/api/topic-plans/${plansRow.id}/pdf`,
          created_at: plansRow.created_at,
        },
        link: {
          href: `/api/topic-plans/${plansRow.id}/pdf`,
          label: 'Download PDF',
        },
      };
    },
  },
];
