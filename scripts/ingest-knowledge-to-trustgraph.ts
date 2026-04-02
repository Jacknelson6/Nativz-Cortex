#!/usr/bin/env tsx
/**
 * ingest-knowledge-to-trustgraph.ts
 *
 * Reads all knowledge_nodes from Supabase and ingests them into TrustGraph's
 * cortex-main flow via the text-load service.
 *
 * Batch order: playbooks first (205), then all remaining 1000 nodes.
 *
 * Usage:
 *   tsx scripts/ingest-knowledge-to-trustgraph.ts [--kind playbook] [--dry-run] [--batch-size 10]
 *
 * Options:
 *   --kind <kind>         Only ingest this kind (default: all)
 *   --dry-run             Print what would be sent, no actual writes
 *   --batch-size <n>      Nodes per batch (default: 20)
 *   --flow <id>           TrustGraph flow ID (default: cortex-main)
 *   --delay <ms>          Delay between batches in ms (default: 500)
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
const KIND_FILTER = getArg('--kind') ?? undefined;
const BATCH_SIZE = parseInt(getArg('--batch-size') ?? '20', 10);
const FLOW_ID = getArg('--flow') ?? process.env.TRUSTGRAPH_FLOW_ID ?? 'cortex-main';
const DELAY_MS = parseInt(getArg('--delay') ?? '500', 10);
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

interface TGTextLoadRequest {
  id: string;
  service: 'text-load';
  flow: string;
  request: {
    text: string;
    collection: string;
    user: string;
    metadata?: Record<string, unknown>;
  };
}

let _ws: WebSocket | null = null;
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
  const reqId = `ingest-${++_reqCounter}`;
  const msg: TGTextLoadRequest = {
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
        resolve(); // Accept even if response can't be parsed
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

// ── Node formatting ──────────────────────────────────────────────────────────

interface KnowledgeNodeRow {
  id: string;
  kind: string;
  title: string;
  domain: string[];
  tags: string[];
  connections: string[];
  content: string;
  metadata: Record<string, unknown>;
  client_id: string | null;
  created_at: string;
  updated_at: string;
}

function nodeToText(node: KnowledgeNodeRow): string {
  const lines: string[] = [
    `# ${node.title}`,
    `Kind: ${node.kind}`,
    `ID: ${node.id}`,
  ];
  if (node.domain?.length) lines.push(`Domain: ${node.domain.join(', ')}`);
  if (node.tags?.length) lines.push(`Tags: ${node.tags.join(', ')}`);
  if (node.connections?.length) lines.push(`Connected to: ${node.connections.join(', ')}`);
  lines.push('');
  if (node.content) lines.push(node.content);
  return lines.join('\n');
}

function getCollection(node: KnowledgeNodeRow): string {
  // Group by agency vs client-specific
  if (node.client_id) return `cortex-client-${node.client_id}`;
  return 'agency';
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[ingest-kg] TrustGraph: ${TG_WS_URL} | Flow: ${FLOW_ID}`);
  console.log(`[ingest-kg] Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | batch-size: ${BATCH_SIZE} | kind-filter: ${KIND_FILTER ?? 'all'}`);

  const supabase = createAdminClient();

  // Fetch nodes — playbooks first, then rest
  console.log('[ingest-kg] Fetching knowledge_nodes from Supabase...');
  const allNodes: KnowledgeNodeRow[] = [];
  let offset = 0;
  const PAGE = 500;

  while (true) {
    let query = supabase
      .from('knowledge_nodes')
      .select('id, kind, title, domain, tags, connections, content, metadata, client_id, created_at, updated_at')
      .order('kind', { ascending: true }) // playbook sorts after others, so we'll re-sort below
      .range(offset, offset + PAGE - 1);

    if (KIND_FILTER) query = query.eq('kind', KIND_FILTER);

    const { data, error } = await query;
    if (error) throw new Error(`Supabase error: ${error.message}`);
    if (!data?.length) break;
    allNodes.push(...(data as KnowledgeNodeRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Sort: playbooks first, then by kind
  allNodes.sort((a, b) => {
    if (a.kind === 'playbook' && b.kind !== 'playbook') return -1;
    if (a.kind !== 'playbook' && b.kind === 'playbook') return 1;
    return a.kind.localeCompare(b.kind);
  });

  console.log(`[ingest-kg] Found ${allNodes.length} nodes to ingest`);

  const kindCounts = allNodes.reduce((acc, n) => {
    acc[n.kind] = (acc[n.kind] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('[ingest-kg] By kind:', JSON.stringify(kindCounts, null, 2));

  if (DRY_RUN) {
    console.log('[ingest-kg] DRY RUN — first 3 nodes:');
    for (const n of allNodes.slice(0, 3)) {
      console.log(`  [${n.kind}] ${n.id}: ${n.title}`);
    }
    console.log(`[ingest-kg] Would send ${allNodes.length} nodes to TrustGraph`);
    return;
  }

  // Open WebSocket
  console.log('[ingest-kg] Connecting to TrustGraph WebSocket...');
  let ws: WebSocket;
  try {
    ws = await openWebSocket(TG_WS_URL);
    console.log('[ingest-kg] Connected!');
  } catch (e) {
    console.error(`[ingest-kg] Failed to connect to TrustGraph: ${e}`);
    console.error('[ingest-kg] Make sure TrustGraph is running on localhost:8080');
    process.exit(1);
  }

  let ingested = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    for (let i = 0; i < allNodes.length; i += BATCH_SIZE) {
      const batch = allNodes.slice(i, i + BATCH_SIZE);
      console.log(`[ingest-kg] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allNodes.length / BATCH_SIZE)} (${i + 1}-${Math.min(i + BATCH_SIZE, allNodes.length)}/${allNodes.length})`);

      for (const node of batch) {
        try {
          const text = nodeToText(node);
          const collection = getCollection(node);
          await sendTextLoad(ws, text, collection, {
            node_id: node.id,
            kind: node.kind,
            title: node.title,
            domain: node.domain ?? [],
            client_id: node.client_id ?? null,
          });
          ingested++;
          if (ingested % 10 === 0) {
            process.stdout.write(`\r[ingest-kg] Progress: ${ingested}/${allNodes.length}`);
          }
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          failed++;
          errors.push(`${node.id}: ${errMsg}`);
          console.warn(`\n[ingest-kg] Failed: ${node.id} — ${errMsg}`);
        }
      }

      if (i + BATCH_SIZE < allNodes.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }
  } finally {
    ws.close();
  }

  console.log(`\n[ingest-kg] Done — ingested: ${ingested}, failed: ${failed}`);
  if (errors.length > 0) {
    console.warn(`[ingest-kg] Errors (first 10):`);
    for (const e of errors.slice(0, 10)) console.warn(`  - ${e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[ingest-kg] Fatal:', e);
  process.exit(1);
});
