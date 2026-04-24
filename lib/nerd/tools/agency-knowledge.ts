import { z } from 'zod';
import { ToolDefinition } from '../types';
import {
  searchKnowledgeNodes,
  getKnowledgeNode,
  getKnowledgeNodes,
  createKnowledgeNode,
} from '@/lib/knowledge/graph-queries';

export const agencyKnowledgeTools: ToolDefinition[] = [
  // ── search_agency_knowledge ──────────────────────────────────
  {
    name: 'search_agency_knowledge',
    description:
      "Search the agency knowledge graph for SOPs, skills, patterns, methodology, and more. Use this when the user asks about how to do something, agency processes, best practices, or needs operational knowledge.",
    parameters: z.object({
      query: z.string().describe('Natural language search query'),
      kinds: z.array(z.string()).optional().describe('Filter by node kind (e.g. sop, skill, pattern, methodology)'),
      domains: z.array(z.string()).optional().describe('Filter by domain (e.g. marketing, production, operations)'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const query = params.query as string;
        const kinds = params.kinds as string[] | undefined;
        const domains = params.domains as string[] | undefined;

        // Semantic search first (includes FTS fallback internally)
        let results = await searchKnowledgeNodes(query, {
          kinds,
          domains,
          limit: 8,
        });

        // If semantic search returned nothing, try direct listing with text filter
        if (results.length === 0) {
          const ftsResults = await getKnowledgeNodes({
            search: query,
            kind: kinds,
            domain: domains,
            limit: 8,
          });
          results = ftsResults.map((r) => ({ ...r, similarity: 0 }));
        }

        if (results.length === 0) {
          return {
            success: true,
            data: { total: 0, results: [], message: 'No matching knowledge nodes found. Try a broader query.' },
          };
        }

        const formatted = results.map((r) => ({
          id: r.id,
          title: r.title,
          kind: r.kind,
          domain: r.domain,
          similarity: Math.round(r.similarity * 100) / 100,
          preview: (r.content ?? '').length > 500 ? (r.content ?? '').substring(0, 500) + '...' : r.content,
          link: `/brain?node=${encodeURIComponent(r.id)}`,
        }));

        return {
          success: true,
          data: { total: formatted.length, results: formatted },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('search_agency_knowledge tool error:', msg);
        return {
          success: false,
          error: `Knowledge graph search failed: ${msg}. This may mean the search RPCs need to be re-created — ask an admin to run migration 082.`,
        };
      }
    },
  },

  // ── get_knowledge_node ──────────────────────────────────
  {
    name: 'get_knowledge_node',
    description:
      'Get the full content of a specific knowledge node by its ID. Use this after searching to read the full details of a relevant node.',
    parameters: z.object({
      id: z.string().describe('The knowledge node ID (e.g. "sop:google-ads")'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const id = params.id as string;
        const node = await getKnowledgeNode(id);

        if (!node) {
          return { success: false, error: `Knowledge node "${id}" not found` };
        }

        return {
          success: true,
          data: {
            id: node.id,
            title: node.title,
            kind: node.kind,
            domain: node.domain,
            tags: node.tags,
            content: node.content,
            connections: node.connections,
            client_id: node.client_id,
            created_at: node.created_at,
            updated_at: node.updated_at,
            link: `/brain?node=${encodeURIComponent(node.id)}`,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to fetch knowledge node',
        };
      }
    },
  },

  // ── create_knowledge_note (agency graph) ──────────────────────────────────
  {
    name: 'create_agency_knowledge_note',
    description:
      'Create a new note in the agency knowledge graph. Use this when the user wants to save information, document a process, or add knowledge to the agency graph.',
    parameters: z.object({
      title: z.string().describe('Title for the knowledge node'),
      content: z.string().describe('Markdown content for the node'),
      kind: z.string().default('note').describe('Node kind (e.g. note, sop, pattern, skill)'),
      domain: z.array(z.string()).optional().describe('Domains this node belongs to'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
      client_id: z.string().optional().describe('Client ID if this is client-specific knowledge'),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const title = params.title as string;
        const content = params.content as string;
        const kind = (params.kind as string) || 'note';
        const domain = (params.domain as string[]) ?? [];
        const tags = (params.tags as string[]) ?? [];
        const clientId = (params.client_id as string) ?? null;

        // Generate ID as kind:slugified-title
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 80);
        const id = `${kind}:${slug}`;

        const node = await createKnowledgeNode({
          id,
          kind,
          title,
          content,
          domain,
          tags,
          connections: [],
          metadata: { source_tool: 'nerd_chat' },
          client_id: clientId,
          source_repo: null,
          source_path: null,
          created_by: userId ?? null,
        });

        return {
          success: true,
          data: {
            id: node.id,
            title: node.title,
            kind: node.kind,
            link: `/brain?node=${encodeURIComponent(node.id)}`,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create knowledge node',
        };
      }
    },
  },

  // ── list_knowledge_by_kind ──────────────────────────────────
  {
    name: 'list_knowledge_by_kind',
    description:
      "List knowledge nodes by kind (e.g., all SOPs, all skills for a domain). Use this when the user wants to browse what's available in the knowledge graph.",
    parameters: z.object({
      kind: z.string().describe('Node kind to list (e.g. sop, skill, pattern, methodology, workflow, template)'),
      domain: z.string().optional().describe('Optional domain filter'),
      limit: z.number().min(1).max(50).default(20).optional(),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const kind = params.kind as string;
        const domain = params.domain as string | undefined;
        const limit = (params.limit as number) ?? 20;

        const nodes = await getKnowledgeNodes({
          kind,
          domain: domain ? [domain] : undefined,
          limit,
        });

        const formatted = nodes.map((n) => ({
          id: n.id,
          title: n.title,
          domain: n.domain,
          tags: n.tags,
          connections_count: n.connections?.length ?? 0,
          updated_at: n.updated_at,
        }));

        return {
          success: true,
          data: { kind, total: formatted.length, nodes: formatted },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to list knowledge nodes',
        };
      }
    },
  },
];
