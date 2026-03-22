import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServiceAccountGmailToken } from '@/lib/google/service-account';
import {
  fyxerHtmlToMarkdown,
  getProspectBucketClientId,
  matchClient,
} from '@/lib/knowledge/fyxer-importer';
import {
  extractCompanyLabelFromSubject,
  inferMeetingSeriesFromText,
} from '@/lib/meetings/meeting-note-helpers';
import type { MeetingNoteMetadata } from '@/lib/knowledge/types';
import { filterClientsForFyxerMatching } from '@/lib/knowledge/fyxer-client-scope';
import { embedKnowledgeEntry } from '@/lib/ai/embeddings';

// ---------------------------------------------------------------------------
// Gmail helpers
// ---------------------------------------------------------------------------

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const fyxerTools: ToolDefinition[] = [
  // ── search_fyxer_meetings ────────────────────────────────────
  {
    name: 'search_fyxer_meetings',
    description:
      'Search Fyxer meeting recap emails in Gmail. Returns recent meeting summaries with titles, dates, and snippets. Use when asked about past meetings, what was discussed, or meeting history.',
    parameters: z.object({
      query: z.string().optional().describe('Additional search keywords (e.g., client name, topic)'),
      max_results: z.number().min(1).max(20).default(10),
    }),
    riskLevel: 'read',
    handler: async (params, userId) => {
      try {
        const accessToken = await getServiceAccountGmailToken();
        const extraQuery = params.query ? ` ${params.query}` : '';
        const gmailQuery = `from:notetaker@fyxer.com -subject:prep -subject:reminder -subject:hidden${extraQuery}`;
        const maxResults = (params.max_results as number) ?? 10;

        const searchParams = new URLSearchParams({ q: gmailQuery, maxResults: String(maxResults) });
        const listRes = await gmailFetch<{ messages?: { id: string }[] }>(
          accessToken,
          `/messages?${searchParams}`,
        );

        const messageRefs = listRes.messages ?? [];
        if (messageRefs.length === 0) {
          return { success: true, data: { total: 0, meetings: [] } };
        }

        // Fetch headers for each message
        const meetings = await Promise.all(
          messageRefs.slice(0, maxResults).map(async (ref) => {
            const msg = await gmailFetch<{
              id: string;
              snippet: string;
              internalDate: string;
              payload: { headers: { name: string; value: string }[] };
            }>(accessToken, `/messages/${ref.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`);

            const subject = msg.payload.headers.find(
              (h) => h.name.toLowerCase() === 'subject',
            )?.value ?? 'Untitled';
            const date = msg.payload.headers.find(
              (h) => h.name.toLowerCase() === 'date',
            )?.value ?? '';

            return {
              email_id: msg.id,
              title: subject,
              date,
              snippet: msg.snippet?.substring(0, 200) ?? '',
            };
          }),
        );

        return {
          success: true,
          data: { total: meetings.length, meetings },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to search Fyxer meetings',
        };
      }
    },
  },

  // ── get_fyxer_meeting ──────────────────────────────────────────
  {
    name: 'get_fyxer_meeting',
    description:
      'Fetch the full content of a specific Fyxer meeting recap by email ID. Returns the structured meeting notes as markdown. Use after search_fyxer_meetings to get full details.',
    parameters: z.object({
      email_id: z.string().describe('Gmail message ID from search_fyxer_meetings'),
    }),
    riskLevel: 'read',
    handler: async (params, userId) => {
      try {
        const accessToken = await getServiceAccountGmailToken();
        const emailId = params.email_id as string;

        const msg = await gmailFetch<{
          id: string;
          internalDate: string;
          payload: {
            headers: { name: string; value: string }[];
            body?: { data?: string };
            parts?: { mimeType: string; body: { data?: string } }[];
          };
        }>(accessToken, `/messages/${emailId}?format=full`);

        const subject = msg.payload.headers.find(
          (h) => h.name.toLowerCase() === 'subject',
        )?.value ?? 'Untitled';

        // Get HTML body
        let htmlBody = '';
        if (msg.payload.body?.data) {
          htmlBody = Buffer.from(
            msg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'),
            'base64',
          ).toString('utf-8');
        } else {
          for (const part of msg.payload.parts ?? []) {
            if (part.mimeType === 'text/html' && part.body.data) {
              htmlBody = Buffer.from(
                part.body.data.replace(/-/g, '+').replace(/_/g, '/'),
                'base64',
              ).toString('utf-8');
              break;
            }
          }
        }

        if (!htmlBody) {
          return { success: false, error: 'Could not extract email content' };
        }

        const markdown = fyxerHtmlToMarkdown(htmlBody);

        return {
          success: true,
          data: {
            email_id: emailId,
            title: subject,
            date: new Date(Number(msg.internalDate)).toISOString().split('T')[0],
            content: markdown,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to fetch meeting',
        };
      }
    },
  },

  // ── import_fyxer_meeting ──────────────────────────────────────
  {
    name: 'import_fyxer_meeting',
    description:
      "Import a Fyxer meeting recap into a client's knowledge vault. Parses the email HTML to markdown (no AI tokens), matches to client, and saves with wikilinks. Use when asked to import or save a meeting.",
    parameters: z.object({
      email_id: z.string().describe('Gmail message ID to import'),
      client_id: z.string().optional().describe('Client ID to import into (auto-detected if omitted)'),
    }),
    riskLevel: 'write',
    handler: async (params, userId) => {
      try {
        const accessToken = await getServiceAccountGmailToken();
        const emailId = params.email_id as string;
        const clientId = params.client_id as string | undefined;

        // Check if already imported
        const admin = createAdminClient();
        const { data: existing } = await admin
          .from('client_knowledge_entries')
          .select('id, title')
          .eq('type', 'meeting_note')
          .eq('metadata->fyxer_email_id', emailId)
          .maybeSingle();

        if (existing) {
          return {
            success: true,
            data: { already_imported: true, id: existing.id, title: existing.title },
          };
        }

        // Fetch the email
        const msg = await gmailFetch<{
          id: string;
          internalDate: string;
          payload: {
            headers: { name: string; value: string }[];
            body?: { data?: string };
            parts?: { mimeType: string; body: { data?: string } }[];
          };
        }>(accessToken, `/messages/${emailId}?format=full`);

        const subject = msg.payload.headers.find(
          (h) => h.name.toLowerCase() === 'subject',
        )?.value ?? 'Untitled';

        // Get HTML body
        let htmlBody = '';
        if (msg.payload.body?.data) {
          htmlBody = Buffer.from(
            msg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'),
            'base64',
          ).toString('utf-8');
        } else {
          for (const part of msg.payload.parts ?? []) {
            if (part.mimeType === 'text/html' && part.body.data) {
              htmlBody = Buffer.from(
                part.body.data.replace(/-/g, '+').replace(/_/g, '/'),
                'base64',
              ).toString('utf-8');
              break;
            }
          }
        }

        if (!htmlBody) {
          return { success: false, error: 'Could not extract email content' };
        }

        const markdown = fyxerHtmlToMarkdown(htmlBody);
        if (!markdown || markdown.length < 50) {
          return { success: false, error: 'Email content too short to import' };
        }

        let resolvedClientId = clientId;
        let association: MeetingNoteMetadata['association'] = 'client';
        let companyLabel: string | undefined;

        if (!resolvedClientId) {
          const { data: clientRows } = await admin
            .from('clients')
            .select('id, name, slug, website_url, agency')
            .eq('is_active', true);

          const scoped = filterClientsForFyxerMatching(clientRows ?? []);
          const clients = scoped.map(({ id, name, slug, website_url }) => ({
            id,
            name,
            slug,
            website_url,
          }));

          const matched = matchClient(subject, markdown, clients);
          if (matched) {
            resolvedClientId = matched.id;
            association = 'client';
          } else {
            const bucket = await getProspectBucketClientId();
            if (!bucket) {
              return {
                success: false,
                error:
                  'Could not auto-detect client. Specify client_id, or add an active client with slug fyxer-prospects for unmatched meetings.',
              };
            }
            resolvedClientId = bucket;
            association = 'prospect';
            companyLabel = extractCompanyLabelFromSubject(subject);
          }
        }

        const meetingSeries = inferMeetingSeriesFromText(subject);

        // Extract date
        const dateMatch = htmlBody.match(
          /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\w+ \d{1,2},\s*\d{4})/i
        ) ?? htmlBody.match(/(\w{3}\s+\d{1,2},\s*\d{4})\s*(?:•|·)/);
        const meetingDate = dateMatch
          ? new Date(dateMatch[1]).toISOString().split('T')[0]
          : new Date(Number(msg.internalDate)).toISOString().split('T')[0];

        const durationMatch = htmlBody.match(/(\d+)\s*minutes/i);
        const duration = durationMatch ? `${durationMatch[1]} minutes` : undefined;

        const title = `Meeting notes ${meetingDate} — ${subject}`;

        // Inject wikilinks
        const { getKnowledgeEntries } = await import('@/lib/knowledge/queries');
        const existingEntries = await getKnowledgeEntries(resolvedClientId);
        let enrichedMarkdown = markdown;
        for (const entry of existingEntries) {
          if (entry.title.length < 4) continue;
          const escaped = entry.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b(${escaped})\\b`, 'gi');
          if (!enrichedMarkdown.includes(`[[${entry.title}]]`)) {
            enrichedMarkdown = enrichedMarkdown.replace(regex, `[[${entry.title}]]`);
          }
        }

        // Save
        const { createKnowledgeEntry } = await import('@/lib/knowledge/queries');
        const entry = await createKnowledgeEntry({
          client_id: resolvedClientId,
          type: 'meeting_note',
          title,
          content: enrichedMarkdown,
          metadata: {
            meeting_date: meetingDate,
            source: 'fyxer',
            fyxer_email_id: emailId,
            meeting_series: meetingSeries,
            association,
            ...(companyLabel ? { company_label: companyLabel } : {}),
            ...(duration ? { duration } : {}),
          },
          source: 'imported',
          created_by: userId,
        });

        // Auto-link entities and embed for semantic search (non-blocking)
        try {
          const { autoLinkEntities } = await import('@/lib/knowledge/entity-linker');
          await autoLinkEntities(resolvedClientId, entry.id);
        } catch (err) {
          console.error('Fyxer import: auto-link failed', err);
        }
        embedKnowledgeEntry(entry.id).catch(() => {});

        return {
          success: true,
          data: { id: entry.id, title: entry.title, client_id: resolvedClientId },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to import meeting',
        };
      }
    },
  },
];
