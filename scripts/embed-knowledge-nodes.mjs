#!/usr/bin/env node

/**
 * embed-knowledge-nodes.mjs
 *
 * Generate Gemini embeddings for all knowledge_nodes that don't have one.
 * Uses batch API (100 per call) with rate limiting for the free tier (1,500/min).
 *
 * Usage:
 *   node scripts/embed-knowledge-nodes.mjs              # embed all unembedded
 *   node scripts/embed-knowledge-nodes.mjs --limit 500  # first 500 only
 *   node scripts/embed-knowledge-nodes.mjs --dry-run    # count unembedded, don't process
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const ENV_FILE = join(PROJECT_ROOT, '.env.local');

const GEMINI_MODEL = 'gemini-embedding-001';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const EMBEDDING_DIMS = 768;
const BATCH_SIZE = 100;       // Gemini batch limit
const BATCHES_PER_MINUTE = 14; // Stay under 1,500 req/min (14 × 100 = 1,400)
const DELAY_BETWEEN_BATCHES_MS = Math.ceil(60_000 / BATCHES_PER_MINUTE); // ~4.3s

// ---------------------------------------------------------------------------
// Load env
// ---------------------------------------------------------------------------

function loadEnv() {
  try {
    const content = readFileSync(ENV_FILE, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

loadEnv();

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1]) : null;

// ---------------------------------------------------------------------------
// Gemini batch embedding
// ---------------------------------------------------------------------------

async function batchEmbed(texts) {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_STUDIO_KEY not set in .env.local');

  const res = await fetch(
    `${GEMINI_API_URL}/${GEMINI_MODEL}:batchEmbedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${GEMINI_MODEL}`,
        requests: texts.map(text => ({
          model: `models/${GEMINI_MODEL}`,
          content: { parts: [{ text: text.slice(0, 10_000) }] },
          outputDimensionality: EMBEDDING_DIMS,
        })),
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const embeddings = data?.embeddings ?? [];
  return embeddings.map(e => e?.values?.length === EMBEDDING_DIMS ? e.values : null);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch nodes without embeddings (paginate to get all — Supabase default limit is 1000)
  console.log('Fetching unembedded knowledge nodes...');
  const allNodes = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('knowledge_nodes')
      .select('id, title, content, kind')
      .is('embedding', null)
      .order('kind', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    const { data: page, error: pageError } = await query;
    if (pageError) { console.error('Query error:', pageError.message); process.exit(1); }
    if (!page || page.length === 0) break;
    allNodes.push(...page);
    offset += page.length;
    if (page.length < PAGE_SIZE) break;
    if (limit && allNodes.length >= limit) break;
  }

  const nodes = limit ? allNodes.slice(0, limit) : allNodes;
  const error = null;
  if (error) { console.error('Query error:', error.message); process.exit(1); }

  console.log(`Found ${nodes.length} nodes without embeddings`);

  if (dryRun) {
    const byKind = {};
    for (const n of nodes) byKind[n.kind] = (byKind[n.kind] || 0) + 1;
    console.log('\nBy kind:');
    for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(25)} ${v}`);
    }
    console.log(`\nEstimated time: ${Math.ceil(nodes.length / BATCH_SIZE * DELAY_BETWEEN_BATCHES_MS / 60_000)} minutes`);
    return;
  }

  // Process in batches
  const totalBatches = Math.ceil(nodes.length / BATCH_SIZE);
  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const batch = nodes.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    // Build text for embedding: title + kind + first 2000 chars of content
    const texts = batch.map(n => {
      const snippet = (n.content ?? '').slice(0, 2000);
      return `${n.title} [${n.kind}]\n\n${snippet}`;
    });

    try {
      const embeddings = await batchEmbed(texts);

      // Store each embedding
      let batchSuccess = 0;
      for (let j = 0; j < batch.length; j++) {
        if (!embeddings[j]) { failed++; continue; }

        const { error: updateError } = await supabase
          .from('knowledge_nodes')
          .update({ embedding: JSON.stringify(embeddings[j]) })
          .eq('id', batch[j].id);

        if (updateError) {
          console.error(`  Failed to store ${batch[j].id}: ${updateError.message}`);
          failed++;
        } else {
          batchSuccess++;
          embedded++;
        }
      }

      console.log(`  Batch ${batchNum}/${totalBatches}: ${batchSuccess}/${batch.length} embedded (${embedded} total, ${failed} failed)`);
    } catch (err) {
      console.error(`  Batch ${batchNum}/${totalBatches} FAILED: ${err.message}`);
      failed += batch.length;
    }

    // Rate limit: wait between batches
    if (i + BATCH_SIZE < nodes.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log(`\n========================================`);
  console.log(`Done!`);
  console.log(`  Embedded: ${embedded}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total:    ${nodes.length}`);

  // Build IVFFlat index if we embedded a significant number
  if (embedded > 1000) {
    console.log(`\nBuilding IVFFlat index (this may take a moment)...`);
    const { error: idxError } = await supabase.rpc('exec_sql', {
      sql: `CREATE INDEX IF NOT EXISTS idx_kn_embedding ON knowledge_nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`
    }).catch(() => ({ error: { message: 'RPC not available — run manually in Supabase SQL editor' } }));

    if (idxError) {
      console.log(`  Note: Run this SQL manually in Supabase dashboard:`);
      console.log(`  CREATE INDEX IF NOT EXISTS idx_kn_embedding ON knowledge_nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`);
    } else {
      console.log(`  IVFFlat index created!`);
    }
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
