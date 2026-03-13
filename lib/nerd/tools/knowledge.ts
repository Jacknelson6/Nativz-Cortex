import { z } from 'zod';
import { ToolDefinition } from '../types';
import { getKnowledgeEntries, createKnowledgeEntry } from '@/lib/knowledge/queries';
import { searchKnowledge } from '@/lib/knowledge/search';
import { generateBrandProfile } from '@/lib/knowledge/brand-profile';
import { generateVideoIdeas } from '@/lib/knowledge/idea-generator';
import { embedKnowledgeEntry } from '@/lib/ai/embeddings';

export const knowledgeTools: ToolDefinition[] = [
  // ── query_client_knowledge ──────────────────────────────────
  {
    name: 'query_client_knowledge',
    description:
      "Search a client's knowledge base for entries by keyword or type. Use when asked about a client's brand, website content, saved notes, or documents.",
    parameters: z.object({
      client_id: z.string(),
      type: z
        .enum(['brand_asset', 'brand_profile', 'document', 'web_page', 'note', 'idea', 'meeting_note'])
        .optional(),
      keyword: z.string().optional(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const clientId = params.client_id as string;
        const type = params.type as string | undefined;
        const keyword = (params.keyword as string | undefined)?.toLowerCase();

        let entries = await getKnowledgeEntries(clientId, type as Parameters<typeof getKnowledgeEntries>[1]);

        if (keyword) {
          entries = entries.filter(
            (e) =>
              e.title.toLowerCase().includes(keyword) ||
              (e.content ?? '').toLowerCase().includes(keyword)
          );
        }

        const snippets = entries.slice(0, 10).map((e) => ({
          id: e.id,
          type: e.type,
          title: e.title,
          content: (e.content ?? '').length > 300 ? (e.content ?? '').substring(0, 300) + '...' : e.content,
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

  // ── get_knowledge_entry ──────────────────────────────────
  {
    name: 'get_knowledge_entry',
    description:
      'Fetch the full content of a single knowledge entry by ID. Use after search_knowledge_base to read the complete text of a relevant result.',
    parameters: z.object({
      entry_id: z.string().describe('The knowledge entry ID from a search result'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const admin = createAdminClient();
        const { data, error } = await admin
          .from('client_knowledge_entries')
          .select('id, client_id, type, title, content, metadata, source, created_at')
          .eq('id', params.entry_id as string)
          .single();

        if (error || !data) {
          return { success: false, error: 'Entry not found' };
        }

        return {
          success: true,
          data: {
            id: data.id,
            type: data.type,
            title: data.title,
            content: data.content,
            metadata: data.metadata,
            source: data.source,
            created_at: data.created_at,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to fetch entry',
        };
      }
    },
  },

  // ── search_knowledge_base ──────────────────────────────────
  {
    name: 'search_knowledge_base',
    description:
      "Semantic search across a client's knowledge vault. Returns the most relevant entries by meaning, not just keywords. Use this tool to find relevant context BEFORE answering questions about a client — do NOT try to load all knowledge entries.",
    parameters: z.object({
      client_id: z.string(),
      query: z.string().describe('Natural language search query describing what you need'),
      type: z
        .enum(['brand_asset', 'brand_profile', 'document', 'web_page', 'note', 'idea', 'meeting_note'])
        .optional(),
      limit: z.number().min(1).max(20).default(5),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const clientId = params.client_id as string;
        const query = params.query as string;
        const type = params.type as string | undefined;
        const limit = (params.limit as number) ?? 5;

        const results = await searchKnowledge(clientId, query, {
          limit,
          types: type ? [type] : undefined,
        });

        const formatted = results.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          content: r.content.length > 500 ? r.content.substring(0, 500) + '...' : r.content,
          score: Math.round(r.score * 100) / 100,
        }));

        return {
          success: true,
          data: { total: formatted.length, results: formatted },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to search knowledge base',
        };
      }
    },
  },

  // ── create_knowledge_note ──────────────────────────────────
  {
    name: 'create_knowledge_note',
    description:
      "Create a new note in a client's knowledge vault. Use when the conversation produces useful information that should be saved.",
    parameters: z.object({
      client_id: z.string(),
      title: z.string(),
      content: z.string().describe('Markdown content for the note'),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const clientId = params.client_id as string;
        const title = params.title as string;
        const content = params.content as string;

        const entry = await createKnowledgeEntry({
          client_id: clientId,
          type: 'note',
          title,
          content,
          metadata: { source_tool: 'nerd_chat' },
          source: 'generated',
          created_by: userId ?? null,
        });

        // Auto-embed for semantic search (non-blocking)
        embedKnowledgeEntry(entry.id).catch(() => {});

        return {
          success: true,
          data: { id: entry.id, title: entry.title, type: entry.type },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create note',
        };
      }
    },
  },

  // ── import_meeting_notes ──────────────────────────────────
  {
    name: 'import_meeting_notes',
    description:
      "Import and structure meeting notes into a client's knowledge vault. Extracts action items, decisions, and topics from a transcript.",
    parameters: z.object({
      client_id: z.string(),
      transcript: z.string().describe('Meeting transcript or notes text'),
      meeting_date: z.string().optional(),
      attendees: z.array(z.string()).optional(),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const { importMeetingNotes } = await import('@/lib/knowledge/meeting-importer');
        const result = await importMeetingNotes(
          params.client_id as string,
          params.transcript as string,
          {
            meetingDate: params.meeting_date as string | undefined,
            attendees: params.attendees as string[] | undefined,
            source: 'nerd_chat',
            createdBy: userId ?? null,
          }
        );

        return {
          success: true,
          data: {
            id: result.entry.id,
            title: result.entry.title,
            linkedEntries: result.linkedEntries,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to import meeting notes',
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
