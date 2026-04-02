#!/usr/bin/env tsx
/**
 * import-fyxer-meetings.ts
 *
 * Background script to import Fyxer meeting notes from Gmail into
 * client_knowledge_entries. Queries both jack@nativz.io and
 * jack@andersoncollaborative.com for Fyxer emails from the last 7 days.
 *
 * Uses gws CLI for Gmail queries and the existing fyxer-importer logic
 * for HTML parsing + client matching + Supabase writes.
 *
 * Usage:
 *   npm run fyxer:import
 *   tsx scripts/import-fyxer-meetings.ts [--dry-run]
 */

import { execSync } from 'child_process';
import { loadEnvLocal } from './load-env-local';

loadEnvLocal();

import { createClient } from '@supabase/supabase-js';
import {
  fyxerHtmlToMarkdown,
  matchClient,
  getProspectBucketClientId,
} from '@/lib/knowledge/fyxer-importer';
import { filterClientsForFyxerMatching } from '@/lib/knowledge/fyxer-client-scope';
import {
  extractCompanyLabelFromSubject,
  inferMeetingSeriesFromText,
} from '@/lib/meetings/meeting-note-helpers';

const DRY_RUN = process.argv.includes('--dry-run');
const ACCOUNTS = ['jack@nativz.io', 'jack@andersoncollaborative.com'];
const GWS_QUERY = 'from:notetaker@fyxer.com newer_than:7d';
const MAX_RESULTS = 20;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body?: string;
}

/**
 * Query Gmail via gws CLI for Fyxer emails.
 */
function queryGmailViaCLI(account: string): GmailMessage[] {
  try {
    const params = JSON.stringify({
      userId: 'me',
      q: GWS_QUERY,
      maxResults: MAX_RESULTS,
    });
    const out = execSync(
      `gws gmail users messages list --params '${params}' --account ${account}`,
      { timeout: 30_000, encoding: 'utf-8' },
    );
    const parsed = JSON.parse(out.trim());
    const messages: GmailMessage[] = [];

    // gws returns messages list — we need to fetch each one
    const refs: { id: string }[] = parsed.messages ?? parsed ?? [];
    for (const ref of refs.slice(0, MAX_RESULTS)) {
      try {
        const msgOut = execSync(
          `gws gmail users messages get --params '{"userId":"me","id":"${ref.id}","format":"full"}' --account ${account}`,
          { timeout: 15_000, encoding: 'utf-8' },
        );
        const msg = JSON.parse(msgOut.trim());
        const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
        const getHeader = (name: string) =>
          headers.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

        // Decode body
        let htmlBody = '';
        const payload = msg.payload ?? {};
        if (payload.body?.data) {
          htmlBody = Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
        } else {
          for (const part of payload.parts ?? []) {
            if (part.mimeType === 'text/html' && part.body?.data) {
              htmlBody = Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
              break;
            }
          }
        }

        messages.push({
          id: ref.id,
          subject: getHeader('Subject'),
          from: getHeader('From'),
          date: getHeader('Date'),
          snippet: msg.snippet ?? '',
          body: htmlBody,
        });
      } catch (e) {
        console.warn(`  [warn] Failed to fetch message ${ref.id}: ${e}`);
      }
    }
    return messages;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[warn] gws query failed for ${account}: ${msg.slice(0, 200)}`);
    return [];
  }
}

/**
 * Get already-imported email IDs to avoid duplicates.
 */
async function getImportedEmailIds(supabase: ReturnType<typeof createAdminClient>): Promise<Set<string>> {
  const { data } = await supabase
    .from('client_knowledge_entries')
    .select('metadata')
    .in('type', ['meeting_note', 'meeting'])
    .not('metadata->fyxer_email_id', 'is', null);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const meta = row.metadata as Record<string, unknown> | null;
    if (meta?.fyxer_email_id) ids.add(meta.fyxer_email_id as string);
  }
  return ids;
}

/**
 * Get active clients for matching.
 */
async function getClients(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, slug, website_url, agency')
    .eq('is_active', true);
  if (error) throw new Error(`Failed to fetch clients: ${error.message}`);
  const scoped = filterClientsForFyxerMatching(data ?? []);
  return scoped.map(({ id, name, slug, website_url }: { id: string; name: string; slug: string; website_url: string | null }) => ({
    id,
    name,
    slug,
    website_url,
  }));
}

/**
 * Extract meeting date from email body or fall back to date header.
 */
function extractMeetingDate(html: string, dateHeader: string): string {
  // Long format: "Monday, February 16, 2026"
  const longMatch = html.match(
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\w+ \d{1,2},\s*\d{4})/i,
  );
  if (longMatch) {
    const parsed = new Date(longMatch[1]);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  // Short format: "Sep 3, 2025"
  const shortMatch = html.match(/(\w{3}\s+\d{1,2},\s*\d{4})\s*(?:•|·)/);
  if (shortMatch) {
    const parsed = new Date(shortMatch[1]);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  // Fall back to email date header
  const d = new Date(dateHeader);
  return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
}

async function main() {
  console.log(`[fyxer-import] Starting — dry-run: ${DRY_RUN}`);
  const supabase = createAdminClient();
  const importedIds = await getImportedEmailIds(supabase);
  const clients = await getClients(supabase);
  const prospectBucketId = await getProspectBucketClientId();

  console.log(`[fyxer-import] Already imported: ${importedIds.size} | Active clients: ${clients.length}`);

  let totalImported = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (const account of ACCOUNTS) {
    console.log(`\n[fyxer-import] Querying ${account}...`);
    const messages = queryGmailViaCLI(account);
    console.log(`[fyxer-import]   Found ${messages.length} Fyxer emails`);

    for (const msg of messages) {
      if (importedIds.has(msg.id)) {
        console.log(`  [skip] Already imported: ${msg.subject}`);
        totalSkipped++;
        continue;
      }

      if (!msg.body || msg.body.length < 100) {
        console.log(`  [skip] No body: ${msg.subject}`);
        totalSkipped++;
        continue;
      }

      const markdown = fyxerHtmlToMarkdown(msg.body);
      if (!markdown || markdown.length < 50) {
        console.log(`  [skip] Insufficient content: ${msg.subject}`);
        totalSkipped++;
        continue;
      }

      const matchedClient = matchClient(msg.subject, markdown, clients);
      const targetClient = matchedClient
        ? matchedClient
        : prospectBucketId
          ? { id: prospectBucketId, name: 'Prospects', slug: 'fyxer-prospects', website_url: null as string | null }
          : null;

      if (!targetClient) {
        console.log(`  [skip] No client match and no prospect bucket: ${msg.subject}`);
        totalSkipped++;
        continue;
      }

      const meetingDate = extractMeetingDate(msg.body, msg.date);
      const meetingSeries = inferMeetingSeriesFromText(msg.subject);
      const association = matchedClient ? 'client' : 'prospect';
      const companyLabel = association === 'prospect' ? extractCompanyLabelFromSubject(msg.subject) : undefined;
      const title = `Meeting notes ${meetingDate} — ${msg.subject}`;

      const metadata: Record<string, unknown> = {
        meeting_date: meetingDate,
        source: 'fyxer',
        fyxer_email_id: msg.id,
        gmail_account: account,
        meeting_series: meetingSeries,
        association,
        ...(companyLabel ? { company_label: companyLabel } : {}),
      };

      console.log(`  [import] ${title} → ${targetClient.name}`);

      if (!DRY_RUN) {
        try {
          const { data: entry, error } = await supabase
            .from('client_knowledge_entries')
            .insert({
              client_id: targetClient.id,
              type: 'meeting',
              title,
              content: markdown,
              metadata,
              source: 'imported',
              created_by: 'fyxer-import-script',
            })
            .select()
            .single();

          if (error) {
            errors.push(`${msg.subject}: ${error.message}`);
            console.error(`  [error] ${error.message}`);
          } else {
            console.log(`  [ok] Created entry ${entry.id}`);
            totalImported++;
            importedIds.add(msg.id); // Prevent double-import if same ID appears for both accounts
          }
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          errors.push(`${msg.subject}: ${errMsg}`);
          console.error(`  [error] ${errMsg}`);
        }
      } else {
        console.log(`  [dry-run] Would import: ${title}`);
        totalImported++;
      }
    }
  }

  console.log(`\n[fyxer-import] Done — imported: ${totalImported}, skipped: ${totalSkipped}`);
  if (errors.length > 0) {
    console.warn(`[fyxer-import] Errors (${errors.length}):`);
    for (const e of errors) console.warn(`  - ${e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[fyxer-import] Fatal:', e);
  process.exit(1);
});
