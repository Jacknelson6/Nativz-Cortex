import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { getKnowledgeEntries, createKnowledgeEntry } from '@/lib/knowledge/queries';
import { searchKnowledge, searchKnowledgeWithIntent } from '@/lib/knowledge/search';
import { KNOWLEDGE_ENTRY_TYPES, type KnowledgeEntryType } from '@/lib/knowledge/types';
import { generateBrandProfile } from '@/lib/knowledge/brand-profile';
import { generateVideoIdeas } from '@/lib/knowledge/idea-generator';
import { embedKnowledgeEntry } from '@/lib/ai/embeddings';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';
import { createClientConstraint } from '@/lib/knowledge/client-constraints';

const knowledgeTypeEnum = z.enum(KNOWLEDGE_ENTRY_TYPES as unknown as [string, ...string[]]);

/**
 * Gate a tool call by the caller's role + organization_id. Admins pass
 * through. Viewers are only allowed to touch data that belongs to a
 * client in their own organization. Returns null when allowed, or a
 * ToolResult-shaped rejection when not.
 *
 * Called by every knowledge tool that accepts a `client_id` parameter —
 * without this gate, the admin Supabase client would bypass RLS and a
 * portal viewer could read/write any client's vault cross-org.
 */
async function requireClientAccess(
  userId: string,
  clientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  // Impersonation-aware gate. A real admin passes through unrestricted.
  // A real viewer — or an admin currently impersonating a client — is
  // scoped to the caller's effective clientIds. That means when Jack
  // (admin) impersonates Avondale, the AI can't call this tool with
  // Landshark's id even though Avondale + Landshark share an org.
  const ctx = await getEffectiveAccessContext(userId, admin);
  if (ctx.role === 'admin') return { ok: true };
  if (ctx.clientIds && ctx.clientIds.includes(clientId)) return { ok: true };
  return { ok: false, error: 'You do not have access to this client.' };
}

export const knowledgeTools: ToolDefinition[] = [
  // ── query_client_knowledge ──────────────────────────────────
  {
    name: 'query_client_knowledge',
    description:
      "Search a client's knowledge base for entries by keyword or type. Use when asked about a client's brand, website content, saved notes, or documents.",
    parameters: z.object({
      client_id: z.string(),
      type: knowledgeTypeEnum.optional(),
      keyword: z.string().optional(),
    }),
    riskLevel: 'read',
    handler: async (params, userId) => {
      try {
        const clientId = params.client_id as string;
        const type = params.type as string | undefined;
        const keyword = (params.keyword as string | undefined)?.toLowerCase();

        const gate = await requireClientAccess(userId, clientId);
        if (!gate.ok) return { success: false, error: gate.error };

        let entries = await getKnowledgeEntries(clientId, type as KnowledgeEntryType | undefined);

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
    handler: async (params, userId) => {
      try {
        const admin = createAdminClient();
        const { data, error } = await admin
          .from('client_knowledge_entries')
          .select(
            'id, client_id, type, title, content, metadata, source, created_at, valid_from, valid_until, confidence, superseded_by',
          )
          .eq('id', params.entry_id as string)
          .single();

        if (error || !data) {
          return { success: false, error: 'Entry not found' };
        }

        // The select above went through the admin client (bypasses RLS), so
        // we now verify the caller has access to this entry's owning client.
        // Rejecting AFTER the fetch is fine — we aren't returning the row
        // contents, just the 404-shaped error.
        const gate = await requireClientAccess(userId, data.client_id as string);
        if (!gate.ok) return { success: false, error: 'Entry not found' };

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
            valid_from: data.valid_from,
            valid_until: data.valid_until,
            confidence: data.confidence,
            superseded_by: data.superseded_by,
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
      type: knowledgeTypeEnum.optional(),
      limit: z.number().min(1).max(20).default(5),
    }),
    riskLevel: 'read',
    handler: async (params, userId) => {
      try {
        const clientId = params.client_id as string;
        const query = params.query as string;
        const type = params.type as string | undefined;
        const limit = (params.limit as number) ?? 5;

        const gate = await requireClientAccess(userId, clientId);
        if (!gate.ok) return { success: false, error: gate.error };

        const { results, intent, preferCurrentOnly } = type
          ? {
              results: await searchKnowledge(clientId, query, { limit, types: [type] }),
              intent: 'manual_type_filter',
              preferCurrentOnly: false,
            }
          : await searchKnowledgeWithIntent(clientId, query, { limit, threshold: 0.3 });

        // Per-type preview caps. Most vault entries are fine at 500 chars
        // (titles + leading context is enough to decide whether to pull the
        // full entry). Brand DNA is different — it carries load-bearing
        // structured sections (messaging pillars, approved CTAs, claim
        // hygiene, framing rules) that live several thousand chars into the
        // body, and the nerd needs them verbatim to script correctly. Give
        // it room to land the whole thing inline so the model doesn't have
        // to chain a second get_knowledge_entry call (and often just
        // doesn't).
        const previewCap = (type: string): number => {
          if (type === 'brand_guideline' || type === 'brand_profile') return 12_000;
          return 500;
        };

        const formatted = results.map((r) => {
          const cap = previewCap(r.type);
          const content = r.content.length > cap ? r.content.substring(0, cap) + '...' : r.content;
          return {
            id: r.id,
            type: r.type,
            title: r.title,
            content,
            score: Math.round(r.score * 100) / 100,
          };
        });

        return {
          success: true,
          data: {
            total: formatted.length,
            results: formatted,
            retrieval: {
              intent,
              prefer_current_only: preferCurrentOnly,
            },
            citation_reminder:
              'Cite sources by title and created_at (and valid_from when present). State temporal validity when answering.',
          },
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

  // ── create_client_constraint ──────────────────────────────────
  {
    name: 'create_client_constraint',
    description:
      'Save a hard client correction that future AI generation must obey. Use when a client says they do not offer something, not to mention a topic, not to use a CTA/claim/phrase, or that an assumption is wrong.',
    parameters: z.object({
      client_id: z.string(),
      statement: z.string().describe('Plain-language correction, e.g. "Client does not offer kitchen remodels."'),
      forbidden_terms: z.array(z.string()).optional().describe('Terms, services, claims, CTAs, or topics future generation should avoid'),
      replacement: z.string().optional().describe('Preferred phrasing or offering to use instead, if any'),
      scope: z
        .enum(['offering', 'topic', 'cta', 'claim', 'language', 'audience', 'visual', 'channel', 'other'])
        .default('other')
        .optional(),
      reason: z.string().optional(),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const clientId = params.client_id as string;
        const gate = await requireClientAccess(userId, clientId);
        if (!gate.ok) return { success: false, error: gate.error };

        const entry = await createClientConstraint(
          clientId,
          {
            statement: params.statement as string,
            forbidden_terms: (params.forbidden_terms as string[] | undefined) ?? [],
            replacement: (params.replacement as string | undefined) ?? null,
            scope: (params.scope as never) ?? 'other',
            reason: (params.reason as string | undefined) ?? null,
            confidence: 0.95,
          },
          {
            createdBy: userId ?? null,
            source: 'generated',
          },
        );

        if (!entry) {
          return { success: false, error: 'Constraint was too vague to save.' };
        }

        return {
          success: true,
          data: {
            id: entry.id,
            title: entry.title,
            type: entry.type,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to save client constraint',
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
            type: result.entry.type,
            linkedEntries: result.linkedEntries,
            extracted_decisions: result.extractedDecisions,
            extracted_action_items: result.extractedActionItems,
            extracted_constraints: result.extractedConstraints,
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
    handler: async (params, userId) => {
      try {
        const clientId = params.client_id as string;
        const concept = params.concept as string | undefined;
        const count = (params.count as number) ?? 10;

        const gate = await requireClientAccess(userId, clientId);
        if (!gate.ok) return { success: false, error: gate.error };

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
