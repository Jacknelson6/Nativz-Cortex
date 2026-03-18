#!/usr/bin/env node

/**
 * migrate-kg-to-supabase.mjs
 *
 * One-time migration: imports all AC Knowledge Graph nodes from the local
 * cloned repo (ac-knowledge-graph/vault/) into the Supabase `knowledge_nodes`
 * table.
 *
 * Usage:
 *   node scripts/migrate-kg-to-supabase.mjs              # full import
 *   node scripts/migrate-kg-to-supabase.mjs --dry-run     # parse + report only
 *   node scripts/migrate-kg-to-supabase.mjs --limit 50    # first 50 files
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, resolve } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const VAULT_ROOT = join(PROJECT_ROOT, 'ac-knowledge-graph', 'vault');
const ENV_FILE = join(PROJECT_ROOT, '.env.local');
const SOURCE_REPO = 'Jacknelson6/ac-knowledge-graph';
const BATCH_SIZE = 500;

// Known frontmatter keys that map directly to columns (everything else → metadata)
const COLUMN_KEYS = new Set([
  'id', 'kind', 'title', 'domain', 'tags', 'connections',
  'created', 'updated',
]);

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ---------------------------------------------------------------------------
// Load .env.local manually (no dotenv dependency)
// ---------------------------------------------------------------------------

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv(ENV_FILE);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://tlhegbkxdkuaouwjhfry.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Frontmatter parser (adapted from ac-knowledge-graph/scripts/lib/frontmatter.mjs)
// ---------------------------------------------------------------------------

function parseRawYaml(yamlString) {
  const result = {};
  let currentKey = null;
  let currentArray = null;

  for (const line of yamlString.split('\n')) {
    // Continuation of a YAML block sequence: "  - item"
    if (currentKey && currentArray !== null && /^\s+-\s+(.*)/.test(line)) {
      const val = line.match(/^\s+-\s+(.*)/)[1].replace(/^["']|["']$/g, '').trim();
      if (val) currentArray.push(val);
      continue;
    }

    // Flush any pending block array when we hit a non-list line
    if (currentKey && currentArray !== null) {
      result[currentKey] = currentArray;
      currentKey = null;
      currentArray = null;
    }

    const kv = line.match(/^(\w[\w_-]*)\s*:\s*(.*)/);
    if (!kv) continue;

    let value = kv[2].trim();

    // Inline array: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      result[kv[1]] = value;
      continue;
    }

    // Start of block array: key with empty value or `[]`
    if (value === '' || value === '[]') {
      currentKey = kv[1];
      currentArray = [];
      continue;
    }

    // Quoted string — strip outer quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[kv[1]] = value;
  }

  // Flush trailing block array
  if (currentKey && currentArray !== null) {
    result[currentKey] = currentArray;
  }

  return result;
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { parsed: null, rawYaml: '', body: content };
  const rawYaml = match[1];
  const parsed = parseRawYaml(rawYaml);
  const body = content.substring(match[0].length).replace(/^\n/, '');
  return { parsed, rawYaml, body };
}

// ---------------------------------------------------------------------------
// File discovery — walk vault/ recursively for .md files
// ---------------------------------------------------------------------------

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkDir(full, files);
    } else if (entry.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Map frontmatter + body → knowledge_nodes row
// ---------------------------------------------------------------------------

function toKnowledgeNode(filePath, parsed, body) {
  const kind = parsed.kind ?? 'unknown';
  const fmId = parsed.id ?? '';
  const nodeId = fmId ? `${kind}:${fmId}` : null;

  if (!nodeId) return null;

  // Ensure arrays
  const domain = Array.isArray(parsed.domain) ? parsed.domain : (parsed.domain ? [parsed.domain] : []);
  const tags = Array.isArray(parsed.tags) ? parsed.tags : (parsed.tags ? [parsed.tags] : []);
  const connections = Array.isArray(parsed.connections) ? parsed.connections : (parsed.connections ? [parsed.connections] : []);

  // Prefix connections with kind if they don't already contain a colon
  // We can't reliably determine the kind of each connection, so leave as-is
  // (the connections field stores the raw frontmatter IDs)

  // Collect remaining frontmatter fields into metadata
  const metadata = {};
  for (const [key, val] of Object.entries(parsed)) {
    if (!COLUMN_KEYS.has(key)) {
      metadata[key] = val;
    }
  }

  // Relative path within the repo (e.g., "vault/skills/google-ads-skill.md")
  const repoRoot = join(PROJECT_ROOT, 'ac-knowledge-graph');
  const sourcePath = relative(repoRoot, filePath);

  // Parse dates
  const createdAt = parsed.created ? new Date(parsed.created).toISOString() : undefined;
  const updatedAt = parsed.updated ? new Date(parsed.updated).toISOString() : undefined;

  return {
    id: nodeId,
    kind,
    title: parsed.title ?? fmId,
    domain,
    tags,
    connections,
    content: body,
    metadata,
    client_id: null,
    source_repo: SOURCE_REPO,
    source_path: sourcePath,
    created_at: createdAt,
    updated_at: updatedAt,
    created_by: 'sync:github',
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nAC Knowledge Graph → Supabase Migration`);
  console.log(`========================================`);
  console.log(`Vault:    ${VAULT_ROOT}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Dry run:  ${DRY_RUN}`);
  console.log(`Limit:    ${LIMIT === Infinity ? 'none' : LIMIT}`);
  console.log('');

  if (!existsSync(VAULT_ROOT)) {
    console.error(`ERROR: Vault directory not found at ${VAULT_ROOT}`);
    process.exit(1);
  }

  // 1. Discover all .md files
  const allFiles = walkDir(VAULT_ROOT);
  const files = allFiles.slice(0, LIMIT);
  console.log(`Found ${allFiles.length} .md files in vault (processing ${files.length})`);

  // 2. Parse frontmatter and build rows
  const rows = [];
  const errors = [];
  const skipped = [];

  for (const filePath of files) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const { parsed, body } = extractFrontmatter(raw);

      if (!parsed) {
        skipped.push({ file: filePath, reason: 'no frontmatter' });
        continue;
      }

      if (!parsed.id) {
        skipped.push({ file: filePath, reason: 'missing id field' });
        continue;
      }

      if (!parsed.kind) {
        skipped.push({ file: filePath, reason: 'missing kind field' });
        continue;
      }

      const row = toKnowledgeNode(filePath, parsed, body);
      if (!row) {
        skipped.push({ file: filePath, reason: 'could not generate node ID' });
        continue;
      }

      rows.push(row);
    } catch (err) {
      errors.push({ file: filePath, error: err.message });
    }
  }

  console.log(`\nParsed: ${rows.length} nodes`);
  if (skipped.length > 0) {
    console.log(`Skipped: ${skipped.length} files`);
    for (const s of skipped.slice(0, 20)) {
      const shortPath = relative(VAULT_ROOT, s.file);
      console.log(`  SKIP  ${shortPath} — ${s.reason}`);
    }
    if (skipped.length > 20) console.log(`  ... and ${skipped.length - 20} more`);
  }
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
    for (const e of errors.slice(0, 10)) {
      const shortPath = relative(VAULT_ROOT, e.file);
      console.log(`  ERR   ${shortPath} — ${e.error}`);
    }
  }

  // Kind breakdown
  const kindCounts = {};
  for (const r of rows) {
    kindCounts[r.kind] = (kindCounts[r.kind] || 0) + 1;
  }
  console.log(`\nBy kind:`);
  for (const [kind, count] of Object.entries(kindCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(20)} ${count}`);
  }

  // Check for duplicate IDs
  const idSet = new Map();
  const duplicates = [];
  for (const r of rows) {
    if (idSet.has(r.id)) {
      duplicates.push({ id: r.id, path1: idSet.get(r.id), path2: r.source_path });
    } else {
      idSet.set(r.id, r.source_path);
    }
  }
  if (duplicates.length > 0) {
    console.log(`\nWARNING: ${duplicates.length} duplicate IDs detected (last file wins on upsert):`);
    for (const d of duplicates.slice(0, 10)) {
      console.log(`  ${d.id}`);
      console.log(`    1: ${d.path1}`);
      console.log(`    2: ${d.path2}`);
    }
  }

  if (DRY_RUN) {
    console.log(`\n--dry-run: No data inserted. Exiting.`);
    return;
  }

  // 3. Insert into Supabase in batches
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  let inserted = 0;
  let upsertErrors = 0;
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    const { data, error } = await supabase
      .from('knowledge_nodes')
      .upsert(batch, {
        onConflict: 'id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`  Batch ${batchNum}/${totalBatches} FAILED: ${error.message}`);
      upsertErrors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`  Batch ${batchNum}/${totalBatches}: upserted ${batch.length} rows (${inserted}/${rows.length} total)`);
    }
  }

  console.log(`\n========================================`);
  console.log(`Done!`);
  console.log(`  Processed: ${files.length} files`);
  console.log(`  Inserted:  ${inserted} nodes`);
  console.log(`  Skipped:   ${skipped.length} files`);
  console.log(`  Parse errors: ${errors.length}`);
  console.log(`  Upsert errors: ${upsertErrors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
