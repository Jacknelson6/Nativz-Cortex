import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadTopicSignals } from '@/lib/topic-plans/signals';

/**
 * extract_topic_signals — flat data accessor for attached topic searches.
 *
 * The Nerd is required to call this before create_topic_plan so it picks
 * ideas FROM the actual research, not from its training data. The output
 * is an explicit list of trending topics with the audience / sentiment /
 * resonance numbers already extracted, plus any pre-built video ideas the
 * search produced. The Nerd then maps each plan idea to a returned topic
 * by name (which becomes the idea's `source` field).
 *
 * Without this tool the model has to scrape the rich Markdown context block
 * we inject upstream — easy to misread, easy to invent. With it, the
 * grounding becomes a deterministic JOIN.
 */
export const topicSignalTools: ToolDefinition[] = [
  {
    name: 'extract_topic_signals',
    description:
      'Read every trending topic out of one or more attached topic searches as a flat list, with the topic name, resonance, sentiment, audience size, positive/negative sentiment %, and any pre-built video ideas. ALWAYS call this before create_topic_plan when the user has attached topic searches — each plan idea must pick a topic_name from this list as its `source` field. Returns { signals: TopicSignal[], total }, where TopicSignal = { search_id, search_query, topic_name, video_ideas[], resonance?, sentiment?, search_audience?, positive_pct?, negative_pct? }.',
    parameters: z.object({
      search_ids: z.array(z.string().uuid()).min(1).max(10).describe(
        'UUIDs of the attached topic_searches to extract signals from. Use the IDs visible at the top of each "## Topic Search" block in your context.',
      ),
    }),
    riskLevel: 'read',
    handler: async (params, userId) => {
      const { search_ids } = params as { search_ids: string[] };

      // For viewers, filter search_ids to only those belonging to clients in
      // the caller's organization. Admins see everything.
      const admin = createAdminClient();
      const { data: me } = await admin
        .from('users')
        .select('role, organization_id')
        .eq('id', userId)
        .single();

      let scopedIds = search_ids;
      if (me && me.role !== 'admin') {
        if (!me.organization_id) {
          return { success: true, cardType: 'search' as const, data: { total: 0, signals: [] } };
        }
        const { data: rows } = await admin
          .from('topic_searches')
          .select('id, clients!inner(organization_id)')
          .in('id', search_ids);
        scopedIds = (rows ?? [])
          .filter((r) => {
            const org = Array.isArray(r.clients)
              ? r.clients[0]?.organization_id
              : (r.clients as { organization_id: string } | null)?.organization_id;
            return org === me.organization_id;
          })
          .map((r) => r.id as string);
      }

      const signals = await loadTopicSignals(scopedIds);
      return {
        success: true,
        cardType: 'search' as const,
        data: {
          total: signals.length,
          signals: signals.map((s) => ({
            search_id: s.search_id,
            search_query: s.search_query,
            topic_name: s.topic_name,
            resonance: s.resonance ?? null,
            sentiment: s.sentiment ?? null,
            search_audience: s.search_audience ?? null,
            positive_pct: s.positive_pct ?? null,
            negative_pct: s.negative_pct ?? null,
            video_idea_count: s.video_ideas.length,
            video_ideas: s.video_ideas.slice(0, 5),
          })),
        },
      };
    },
  },
];
