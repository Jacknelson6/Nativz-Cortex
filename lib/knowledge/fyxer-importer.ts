/**
 * Fyxer.ai meeting notes auto-importer.
 *
 * Polls Gmail for Fyxer recap emails, parses the structured HTML to markdown
 * (zero AI tokens), fuzzy-matches meetings to clients, and saves as
 * knowledge entries with wikilinks.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { getServiceAccountGmailToken } from '@/lib/google/service-account';
import { createKnowledgeEntry, getKnowledgeEntries } from './queries';
import { autoLinkEntities } from './entity-linker';
import type { MeetingNoteMetadata } from './types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const FYXER_QUERY = 'from:notetaker@fyxer.com -subject:prep -subject:reminder -subject:hidden';
const MAX_IMPORT_PER_RUN = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FyxerImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload: {
    headers: { name: string; value: string }[];
    body?: { data?: string };
    parts?: { mimeType: string; body: { data?: string } }[];
  };
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

// ---------------------------------------------------------------------------
// Gmail API helpers
// ---------------------------------------------------------------------------

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

async function searchEmails(accessToken: string, query: string, maxResults = 20): Promise<GmailListResponse> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  return gmailFetch<GmailListResponse>(accessToken, `/messages?${params}`);
}

async function getMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
  return gmailFetch<GmailMessage>(accessToken, `/messages/${messageId}?format=full`);
}

// ---------------------------------------------------------------------------
// HTML → Markdown parser (Fyxer-specific, zero AI tokens)
// ---------------------------------------------------------------------------

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function getHtmlBody(message: GmailMessage): string {
  // Try direct body
  if (message.payload.body?.data) {
    return decodeBase64Url(message.payload.body.data);
  }
  // Try parts
  for (const part of message.payload.parts ?? []) {
    if (part.mimeType === 'text/html' && part.body.data) {
      return decodeBase64Url(part.body.data);
    }
  }
  return '';
}

function getHeader(message: GmailMessage, name: string): string {
  return message.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  )?.value ?? '';
}

/**
 * Convert Fyxer recap HTML to clean markdown.
 * Fyxer uses a consistent structure: h2/h3 headings with ul/li bullets.
 */
export function fyxerHtmlToMarkdown(html: string): string {
  let content = html;

  // Extract from first heading to before boilerplate
  const contentStart = content.search(/<h[23][^>]*>/i);
  if (contentStart > 0) {
    content = content.slice(contentStart);
  }

  // Remove everything from "Rate this summary" onward
  const rateIdx = content.indexOf('Rate this summary');
  if (rateIdx > 0) {
    content = content.slice(0, rateIdx);
  }

  // Remove "View Meeting" button and everything after
  const viewMeetingIdx = content.indexOf('View Meeting');
  if (viewMeetingIdx > 0) {
    const beforeView = content.slice(0, viewMeetingIdx);
    const lastTableOrA = Math.max(
      beforeView.lastIndexOf('<a '),
      beforeView.lastIndexOf('<table'),
    );
    if (lastTableOrA > 0) {
      content = content.slice(0, lastTableOrA);
    }
  }

  // Remove "Ask questions about this meeting" promo section
  const askIdx = content.indexOf('Ask questions about this meeting');
  if (askIdx > 0) {
    const beforeAsk = content.slice(0, askIdx);
    const lastDiv = beforeAsk.lastIndexOf('<div');
    if (lastDiv > 0) {
      content = content.slice(0, lastDiv);
    }
  }

  // Convert HTML to markdown
  let md = content;

  // h2 → ##
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
  // h3 → ###
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');

  // Handle nested lists
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, inner: string) => {
    const parts = inner.split(/<ul[^>]*>/i);
    if (parts.length > 1) {
      const mainText = parts[0].replace(/<[^>]+>/g, '').trim();
      const nestedItems = parts[1]
        .replace(/<\/ul>/gi, '')
        .split(/<li[^>]*>/i)
        .filter(Boolean)
        .map((item) => `  - ${item.replace(/<[^>]+>/g, '').replace(/<\/li>/gi, '').trim()}`)
        .filter((item) => item.trim() !== '  -');
      return `- ${mainText}\n${nestedItems.join('\n')}\n`;
    }
    const text = inner.replace(/<[^>]+>/g, '').trim();
    return text ? `- ${text}\n` : '';
  });

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&#x27;/g, "'");

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

/**
 * Extract meeting date from Fyxer email HTML.
 */
function extractMeetingDate(html: string): string | null {
  // Long format: "Monday, February 16, 2026"
  const longMatch = html.match(
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\w+ \d{1,2},\s*\d{4})/i
  );
  if (longMatch) {
    const parsed = new Date(longMatch[1]);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }

  // Short format: "Sep 3, 2025"
  const shortMatch = html.match(
    /(\w{3}\s+\d{1,2},\s*\d{4})\s*(?:•|·)/
  );
  if (shortMatch) {
    const parsed = new Date(shortMatch[1]);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Extract meeting duration from Fyxer email HTML.
 */
function extractDuration(html: string): string | null {
  const match = html.match(/(\d+)\s*minutes/i);
  return match ? `${match[1]} minutes` : null;
}

// ---------------------------------------------------------------------------
// Client matching (no AI — fuzzy name match)
// ---------------------------------------------------------------------------

interface ClientRow {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
}

async function getAllClients(): Promise<ClientRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('clients')
    .select('id, name, slug, website_url')
    .eq('is_active', true);
  if (error) throw new Error(`Failed to fetch clients: ${error.message}`);
  return (data ?? []) as ClientRow[];
}

/**
 * Match a meeting title against client names.
 * Only matches on the meeting TITLE — body content is ignored to prevent
 * private calls from being imported when a client name is casually mentioned.
 *
 * Returns the best-matching client, or null if no match.
 */
export function matchClient(
  title: string,
  _bodyText: string,
  clients: ClientRow[],
): ClientRow | null {
  const titleLower = title.toLowerCase();

  let bestMatch: ClientRow | null = null;
  let bestScore = 0;

  for (const client of clients) {
    let score = 0;

    // Full client name in title
    if (titleLower.includes(client.name.toLowerCase())) score += 10;

    // Slug in title (e.g., "EcoView" in "EcoView x Nativz / Bi-Weekly")
    if (client.slug.length > 3 && titleLower.includes(client.slug.toLowerCase())) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = client;
    }
  }

  return bestScore >= 10 ? bestMatch : null;
}

// ---------------------------------------------------------------------------
// Dedup check
// ---------------------------------------------------------------------------

async function getImportedEmailIds(): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('client_knowledge_entries')
    .select('metadata')
    .eq('type', 'meeting_note')
    .not('metadata->fyxer_email_id', 'is', null);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const meta = row.metadata as Record<string, unknown> | null;
    if (meta?.fyxer_email_id) {
      ids.add(meta.fyxer_email_id as string);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Main importer
// ---------------------------------------------------------------------------

/**
 * Poll Gmail for new Fyxer recap emails and import them into the knowledge base.
 * Uses a service account with domain-wide delegation to access jack@nativz.io's Gmail.
 * Zero AI tokens — parses Fyxer's structured HTML directly to markdown.
 */
export async function importFyxerEmails(createdBy?: string): Promise<FyxerImportResult> {
  const result: FyxerImportResult = { imported: 0, skipped: 0, errors: [] };

  // 1. Get Gmail access token via service account
  const accessToken = await getServiceAccountGmailToken();
  if (!accessToken) {
    result.errors.push('Service account Gmail token failed — check GOOGLE_SERVICE_ACCOUNT_KEY');
    return result;
  }

  // 2. Fetch all clients for matching
  const clients = await getAllClients();

  // 3. Get already-imported email IDs
  const importedIds = await getImportedEmailIds();

  // 4. Search Gmail for Fyxer recaps
  const listResponse = await searchEmails(accessToken, FYXER_QUERY, MAX_IMPORT_PER_RUN * 2);
  const messageRefs = listResponse.messages ?? [];

  if (messageRefs.length === 0) return result;

  // 5. Process each email
  let processed = 0;
  for (const ref of messageRefs) {
    if (processed >= MAX_IMPORT_PER_RUN) break;

    if (importedIds.has(ref.id)) {
      result.skipped++;
      continue;
    }

    try {
      const message = await getMessage(accessToken, ref.id);
      const subject = getHeader(message, 'Subject');
      const htmlBody = getHtmlBody(message);

      if (!htmlBody) { result.skipped++; continue; }

      // Parse HTML to markdown (zero AI tokens)
      const markdown = fyxerHtmlToMarkdown(htmlBody);
      if (!markdown || markdown.length < 50) { result.skipped++; continue; }

      // Match to a client
      const matchedClient = matchClient(subject, markdown, clients);
      if (!matchedClient) { result.skipped++; continue; }

      // Extract date and duration
      const meetingDate = extractMeetingDate(htmlBody) ??
        new Date(Number(message.internalDate)).toISOString().split('T')[0];
      const duration = extractDuration(htmlBody);

      const title = `Meeting notes ${meetingDate} — ${subject}`;

      // Inject wikilinks where existing knowledge titles appear
      const existingEntries = await getKnowledgeEntries(matchedClient.id);
      let enrichedMarkdown = markdown;
      for (const entry of existingEntries) {
        if (entry.title.length < 4) continue;
        const escaped = entry.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b(${escaped})\\b`, 'gi');
        if (!enrichedMarkdown.includes(`[[${entry.title}]]`)) {
          enrichedMarkdown = enrichedMarkdown.replace(regex, `[[${entry.title}]]`);
        }
      }

      // Build metadata
      const metadata: MeetingNoteMetadata & { fyxer_email_id: string; duration?: string } = {
        meeting_date: meetingDate,
        source: 'fyxer',
        fyxer_email_id: ref.id,
        ...(duration ? { duration } : {}),
      };

      // Create knowledge entry
      const entry = await createKnowledgeEntry({
        client_id: matchedClient.id,
        type: 'meeting_note',
        title,
        content: enrichedMarkdown,
        metadata: metadata as unknown as Record<string, unknown>,
        source: 'imported',
        created_by: createdBy ?? null,
      });

      // Auto-link entities (no AI — just name matching)
      try {
        await autoLinkEntities(matchedClient.id, entry.id);
      } catch (err) {
        console.error(`Fyxer import: failed to auto-link for ${ref.id}`, err);
      }

      result.imported++;
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Email ${ref.id}: ${msg}`);
    }
  }

  return result;
}
