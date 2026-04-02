#!/usr/bin/env tsx
/**
 * ingest-fyxer-to-trustgraph.ts
 *
 * Pulls meeting notes from client_knowledge_entries (type=meeting or meeting_note)
 * and loads them into TrustGraph with a per-client collection.
 *
 * Usage:
 *   tsx scripts/ingest-fyxer-to-trustgraph.ts [--dry-run] [--client-id <uuid>]
 *
 * Options:
 *   --dry-run              Print what would be sent, no actual writes
 *   --client-id <uuid>     Only ingest for this specific client
 *   --flow <id>            TrustGraph flow ID (default: cortex-main)
 */

import WebSocket from 'ws';
import { loadEnvLocal } from './load-env-local';

loadEnvLocal();

import { createClient } from '@supabase/supabase-js';

// ── Config ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const DRY_RUN = args.includes('--dry-run');
const CLIENT_ID_FILTER = getArg('--client-id') ?? undefined;
const FLOW_ID = getArg('--flow') ?? process.env.TRUSTGRAPH_FLOW_ID ?? 'cortex-main';
const TG_BASE = (process.env.TRUSTGRAPH_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const TG_WS_URL = TG_BASE.replace(/^http/, 'ws') + '/api/v1/socket';
const TG_USER = process.env.TRUSTGRAPH_USER ?? 'cortex';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── TrustGraph WebSocket helpers ─────────────────────────────────────────────

let _reqCounter = 0;

async function openWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error('WebSocket connect timeout')), 10_000);
    ws.on('open', () => {
      clearTimeout(timeout);
      resolve(ws);
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function sendTextLoad(
  ws: WebSocket,
  text: string,
  collection: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const reqId = `fyxer-${++_reqCounter}`;
  const msg = {
    id: reqId,
    service: 'text-load',
    flow: FLOW_ID,
    request: {
      text,
      collection,
      user: TG_USER,
      ...(metadata ? { metadata } : {}),
    },
  };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ack ${reqId}`)), 15_000);

    ws.once('message', (data: WebSocket.RawData) => {
      clearTimeout(timeout);
      try {
        const resp = JSON.parse(data.toString());
        if (resp.id === reqId && resp.error) {
          reject(new Error(resp.error));
        } else {
          resolve();
        }
      } catch {
        resolve();
      }
    });

    ws.send(JSON.stringify(msg), (err) => {
      if (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

interface MeetingEntry {
  id: string;
  client_id: string;
  type: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ClientRow {
  id: string;
  name: string;
  slug: string;
}

// ── Formatting ───────────────────────────────────────────────────────────────

function entryToText(entry: MeetingEntry, clientName: string): string {
  const meta = entry.metadata ?? {};
  const lines: string[] = [
    `# ${entry.title}`,
    `Type: meeting_note`,
    `Client: ${clientName}`,
    `Date: ${(meta.meeting_date as string) ?? entry.created_at?.split('T')[0] ?? ''}`,
  ];
  if (meta.meeting_series) lines.push(`Series: ${meta.meeting_series}`);
  if (meta.source) lines.push(`Source: ${meta.source}`);
  lines.push('');
  if (entry.content) lines.push(entry.content);
  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[ingest-fyxer] TrustGraph: ${TG_WS_URL} | Flow: ${FLOW_ID}`);
  console.log(`[ingest-fyxer] Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | client-filter: ${CLIENT_ID_FILTER ?? 'all'}`);

  const supabase = createAdminClient();

  // Fetch clients for name lookup
  const { data: clientsData } = await supabase
    .from('clients')
    .select('id, name, slug');
  const clientMap = new Map<string, ClientRow>(
    (clientsData ?? []).map((c: ClientRow) => [c.id, c]),
  );

  // Fetch meeting entries
  console.log('[ingest-fyxer] Fetching meeting entries from Supabase...');
  let query = supabase
    .from('client_knowledge_entries')
    .select('id, client_id, type, title, content, metadata, created_at')
    .in('type', ['meeting', 'meeting_note'])
    .order('created_at', { ascending: true });

  if (CLIENT_ID_FILTER) query = query.eq('client_id', CLIENT_ID_FILTER);

  const { data: entries, error } = await query;
  if (error) throw new Error(`Supabase error: ${error.message}`);

  console.log(`[ingest-fyxer] Found ${entries?.length ?? 0} meeting entries`);

  // Group by client
  const byClient = new Map<string, MeetingEntry[]>();
  for (const e of entries ?? []) {
    const list = byClient.get(e.client_id) ?? [];
    list.push(e as MeetingEntry);
    byClient.set(e.client_id, list);
  }

  console.log(`[ingest-fyxer] Across ${byClient.size} clients`);

  if (DRY_RUN) {
    for (const [clientId, clientEntries] of byClient) {
      const client = clientMap.get(clientId);
      console.log(`\n  [${client?.name ?? clientId}] (${clientEntries.length} meetings) → collection: cortex-client-${clientId}`);
      for (const e of clientEntries.slice(0, 2)) {
        console.log(`    - ${e.title}`);
      }
    }
    console.log(`\n[ingest-fyxer] Would send ${entries?.length ?? 0} meeting entries`);
    return;
  }

  // Open WebSocket
  console.log('[ingest-fyxer] Connecting to TrustGraph WebSocket...');
  let ws: WebSocket;
  try {
    ws = await openWebSocket(TG_WS_URL);
    console.log('[ingest-fyxer] Connected!');
  } catch (e) {
    console.error(`[ingest-fyxer] Failed to connect to TrustGraph: ${e}`);
    console.error('[ingest-fyxer] Make sure TrustGraph is running on localhost:8080');
    process.exit(1);
  }

  let ingested = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    for (const [clientId, clientEntries] of byClient) {
      const client = clientMap.get(clientId);
      const clientName = client?.name ?? clientId;
      const collection = `cortex-client-${clientId}`;

      console.log(`\n[ingest-fyxer] Client: ${clientName} (${clientEntries.length} meetings) → ${collection}`);

      for (const entry of clientEntries) {
        try {
          const text = entryToText(entry, clientName);
          await sendTextLoad(ws, text, collection, {
            entry_id: entry.id,
            client_id: clientId,
            client_name: clientName,
            type: entry.type,
            title: entry.title,
            meeting_date: (entry.metadata?.meeting_date as string) ?? entry.created_at?.split('T')[0],
            source: (entry.metadata?.source as string) ?? 'unknown',
          });
          ingested++;
          console.log(`  [ok] ${entry.title}`);
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          failed++;
          errors.push(`${entry.id}: ${errMsg}`);
          console.warn(`  [fail] ${entry.title} — ${errMsg}`);
        }
        // Small delay between entries to avoid overloading
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  } finally {
    ws.close();
  }

  console.log(`\n[ingest-fyxer] Done — ingested: ${ingested}, failed: ${failed}`);
  if (errors.length > 0) {
    console.warn(`[ingest-fyxer] Errors:`);
    for (const e of errors) console.warn(`  - ${e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[ingest-fyxer] Fatal:', e);
  process.exit(1);
});
