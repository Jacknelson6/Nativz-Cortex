import { z } from 'zod';
import { ToolDefinition } from '../types';
import { getKnowledgeEntries, getBrandProfile } from '@/lib/knowledge/queries';
import { generateBrandProfile } from '@/lib/knowledge/brand-profile';
import { generateVideoIdeas } from '@/lib/knowledge/idea-generator';

export const knowledgeTools: ToolDefinition[] = [
  // ── query_client_knowledge ──────────────────────────────────
  {
    name: 'query_client_knowledge',
    description:
      "Search a client's knowledge base for entries by keyword or type. Use when asked about a client's brand, website content, saved notes, or documents.",
    parameters: z.object({
      client_id: z.string(),
      type: z
        .enum(['brand_asset', 'brand_profile', 'document', 'web_page', 'note', 'idea'])
        .optional(),
      keyword: z.string().optional(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const clientId = params.client_id as string;
        const type = params.type as
          | 'brand_asset'
          | 'brand_profile'
          | 'document'
          | 'web_page'
          | 'note'
          | 'idea'
          | undefined;
        const keyword = (params.keyword as string | undefined)?.toLowerCase();

        let entries = await getKnowledgeEntries(clientId, type);

        if (keyword) {
          entries = entries.filter(
            (e) =>
              e.title.toLowerCase().includes(keyword) ||
              e.content.toLowerCase().includes(keyword)
          );
        }

        const snippets = entries.slice(0, 10).map((e) => ({
          id: e.id,
          type: e.type,
          title: e.title,
          content: e.content.length > 300 ? e.content.substring(0, 300) + '...' : e.content,
          source: e.source,
          created_at: e.created_at,
        }));

        return {
          success: true,
          data: { total: entries.length, entries: snippets },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to query knowledge base',
        };
      }
    },
  },

  // ── generate_brand_profile ──────────────────────────────────
  {
    name: 'generate_brand_profile',
    description:
      'Generate or regenerate a comprehensive brand profile for a client using all available data.',
    parameters: z.object({
      client_id: z.string(),
    }),
    riskLevel: 'write',
    handler: async (params) => {
      try {
        const clientId = params.client_id as string;
        const entry = await generateBrandProfile(clientId, null);

        return {
          success: true,
          data: {
            id: entry.id,
            title: entry.title,
            content:
              entry.content.length > 500
                ? entry.content.substring(0, 500) + '...'
                : entry.content,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to generate brand profile',
        };
      }
    },
  },

  // ── generate_video_ideas ────────────────────────────────────
  {
    name: 'generate_video_ideas',
    description:
      "Generate video content ideas for a client based on their brand knowledge, past research, and content history.",
    parameters: z.object({
      client_id: z.string(),
      concept: z.string().optional(),
      count: z.number().min(1).max(20).default(10),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const clientId = params.client_id as string;
        const concept = params.concept as string | undefined;
        const count = (params.count as number) ?? 10;

        const ideas = await generateVideoIdeas({ clientId, concept, count });

        return {
          success: true,
          data: { ideas },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to generate video ideas',
        };
      }
    },
  },
];
