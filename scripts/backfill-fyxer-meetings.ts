/**
 * Bulk-import Fyxer meeting notes from the past 90 days.
 *
 * Fetches all Fyxer recap emails via Gmail API, matches to clients,
 * runs AI summarization (via meeting-importer), and saves to each
 * client's knowledge base. Meetings without a client name in the title
 * are skipped.
 *
 * Usage:
 *   npx tsx scripts/backfill-fyxer-meetings.ts
 *   npx tsx scripts/backfill-fyxer-meetings.ts --dry-run
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load env ───────────────────────────────────────────────────────────────────

const envPath = resolve(import.meta.dirname ?? __dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

// ── Imports (after env is loaded) ──────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { getServiceAccountGmailToken } from '@/lib/google/service-account';
import { fyxerHtmlToMarkdown, matchClient } from '@/lib/knowledge/fyxer-importer';
import { importMeetingNotes } from '@/lib/knowledge/meeting-importer';

const DRY_RUN = process.argv.includes('--dry-run');
const DAYS_BACK = 90;
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const BATCH_DELAY_MS = 1500; // rate-limit buffer between AI calls

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Gmail helpers ──────────────────────────────────────────────────────────────

async function gmailFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function getHtmlBody(msg: GmailMessage): string {
  if (msg.payload.body?.data) return decodeBase64Url(msg.payload.body.data);
  for (const part of msg.payload.parts ?? []) {
    if (part.mimeType === 'text/html' && part.body.data) return decodeBase64Url(part.body.data);
  }
  return '';
}

function getHeader(msg: GmailMessage, name: string): string {
  return msg.payload.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function extractMeetingDate(html: string, fallbackMs: string): string {
  const longMatch = html.match(
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\w+ \d{1,2},\s*\d{4})/i
  );
  if (longMatch) {
    const parsed = new Date(longMatch[1]);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  const shortMatch = html.match(/(\w{3}\s+\d{1,2},\s*\d{4})\s*(?:•|·)/);
  if (shortMatch) {
    const parsed = new Date(shortMatch[1]);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  return new Date(Number(fallbackMs)).toISOString().split('T')[0];
}

// ── Supabase ───────────────────────────────────────────────────────────────────

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getAllClients() {
  const { data, error } = await getAdmin()
    .from('clients')
    .select('id, name, slug, website_url')
    .eq('is_active', true);
  if (error) throw new Error(`Clients fetch failed: ${error.message}`);
  return data ?? [];
}

async function getImportedEmailIds(): Promise<Set<string>> {
  const { data } = await getAdmin()
    .from('client_knowledge_entries')
    .select('metadata')
    .eq('type', 'meeting_note')
    .not('metadata->fyxer_email_id', 'is', null);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const meta = row.metadata as Record<string, unknown> | null;
    if (meta?.fyxer_email_id) ids.add(meta.fyxer_email_id as string);
  }
  return ids;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Fyxer meeting backfill — past ${DAYS_BACK} days${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  // 1. Gmail auth
  const accessToken = await getServiceAccountGmailToken();
  if (!accessToken) {
    console.error('❌ Failed to get Gmail token — check GOOGLE_SERVICE_ACCOUNT_KEY');
    process.exit(1);
  }
  console.log('✓ Gmail authenticated');

  // 2. Fetch clients + existing imports
  const clients = await getAllClients();
  console.log(`✓ ${clients.length} active clients loaded`);

  const importedIds = await getImportedEmailIds();
  console.log(`✓ ${importedIds.size} meetings already imported\n`);

  // 3. Build date-bounded query
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_BACK);
  const afterStr = `${cutoff.getFullYear()}/${String(cutoff.getMonth() + 1).padStart(2, '0')}/${String(cutoff.getDate()).padStart(2, '0')}`;
  const query = `from:notetaker@fyxer.com -subject:prep -subject:reminder -subject:hidden after:${afterStr}`;
  console.log(`Gmail query: ${query}\n`);

  // 4. Paginate through all results
  const allRefs: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ q: query, maxResults: '50' });
    if (pageToken) params.set('pageToken', pageToken);

    const page = await gmailFetch<GmailListResponse>(accessToken, `/messages?${params}`);
    if (page.messages) allRefs.push(...page.messages);
    pageToken = page.nextPageToken;
  } while (pageToken);

  console.log(`📬 Found ${allRefs.length} Fyxer emails in the past ${DAYS_BACK} days\n`);

  // 5. Process each email
  let imported = 0;
  let skippedDedup = 0;
  let skippedNoClient = 0;
  let skippedNoContent = 0;
  let errors = 0;

  for (let i = 0; i < allRefs.length; i++) {
    const ref = allRefs[i];
    const progress = `[${i + 1}/${allRefs.length}]`;

    // Dedup check
    if (importedIds.has(ref.id)) {
      skippedDedup++;
      continue;
    }

    try {
      const message = await gmailFetch<GmailMessage>(accessToken, `/messages/${ref.id}?format=full`);
      const subject = getHeader(message, 'Subject');
      const htmlBody = getHtmlBody(message);

      if (!htmlBody) {
        skippedNoContent++;
        continue;
      }

      // Parse to markdown
      const markdown = fyxerHtmlToMarkdown(htmlBody);
      if (!markdown || markdown.length < 50) {
        skippedNoContent++;
        continue;
      }

      // Match to client
      const matched = matchClient(subject, markdown, clients);
      if (!matched) {
        skippedNoClient++;
        console.log(`${progress} ⏭  No client match: "${subject}"`);
        continue;
      }

      const meetingDate = extractMeetingDate(htmlBody, message.internalDate);

      if (DRY_RUN) {
        console.log(`${progress} 🏷  Would import: "${subject}" → ${matched.name} (${meetingDate})`);
        imported++;
        continue;
      }

      // AI-summarize and import
      console.log(`${progress} 📝 Importing: "${subject}" → ${matched.name} (${meetingDate})`);

      const result = await importMeetingNotes(matched.id, markdown, {
        meetingDate,
        source: 'fyxer',
        createdBy: null,
      });

      // Tag entry with fyxer_email_id for dedup
      await getAdmin()
        .from('client_knowledge_entries')
        .update({
          metadata: {
            ...(result.entry.metadata as Record<string, unknown>),
            fyxer_email_id: ref.id,
          },
        })
        .eq('id', result.entry.id);

      imported++;
      console.log(`   ✓ Saved (${result.linkedEntries} entities linked)`);

      // Rate-limit buffer between AI calls
      if (i < allRefs.length - 1) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    } catch (err) {
      errors++;
      console.error(`${progress} ❌ Error on ${ref.id}:`, err instanceof Error ? err.message : err);
    }
  }

  // 6. Summary
  console.log('\n─────────────────────────────────────');
  console.log(`✅ Imported:          ${imported}`);
  console.log(`⏭  Skipped (dedup):   ${skippedDedup}`);
  console.log(`⏭  Skipped (no client): ${skippedNoClient}`);
  console.log(`⏭  Skipped (empty):   ${skippedNoContent}`);
  console.log(`❌ Errors:            ${errors}`);
  console.log('─────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
