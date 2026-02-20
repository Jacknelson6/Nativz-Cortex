/**
 * Standalone script to index vault content into Supabase for search.
 * Run: node scripts/index-vault.mjs
 */

import { readFileSync } from 'fs';
try {
  const envFile = readFileSync('.env.local', 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch { /* no .env.local */ }

const GITHUB_TOKEN = process.env.GITHUB_VAULT_TOKEN;
const GITHUB_REPO = process.env.GITHUB_VAULT_REPO;
const GITHUB_BRANCH = process.env.GITHUB_VAULT_BRANCH || 'main';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GITHUB_TOKEN || !GITHUB_REPO) {
  console.error('Missing GITHUB_VAULT_TOKEN or GITHUB_VAULT_REPO.');
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const GH_BASE = 'https://api.github.com';
const ghHeaders = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
};

const sbHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates',
};

function encodePath(p) {
  return p.split('/').map(s => encodeURIComponent(s)).join('/');
}

async function ghReadFile(path) {
  const res = await fetch(`${GH_BASE}/repos/${GITHUB_REPO}/contents/${encodePath(path)}?ref=${GITHUB_BRANCH}`, {
    headers: ghHeaders,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Read failed: ${res.status}`);
  const d = await res.json();
  return Buffer.from(d.content, 'base64').toString('utf-8');
}

async function ghListDir(path) {
  const res = await fetch(`${GH_BASE}/repos/${GITHUB_REPO}/contents/${encodePath(path)}?ref=${GITHUB_BRANCH}`, {
    headers: ghHeaders,
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map(item => ({ name: item.name, path: item.path, type: item.type }));
}

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const fmBlock = match[1];
  const body = match[2];
  const fm = {};
  let currentKey = null;
  let currentArray = null;

  for (const line of fmBlock.split('\n')) {
    const kvMatch = line.match(/^(\w[\w_]*?):\s*(.*)$/);
    if (kvMatch) {
      if (currentKey && currentArray) {
        fm[currentKey] = currentArray;
        currentArray = null;
      }
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '') {
        currentArray = [];
      } else {
        fm[currentKey] = val.replace(/^["']|["']$/g, '');
        currentKey = null;
      }
    } else if (currentArray !== null && line.match(/^\s+-\s/)) {
      currentArray.push(line.replace(/^\s+-\s*/, '').replace(/^["']|["']$/g, ''));
    }
  }
  if (currentKey && currentArray) fm[currentKey] = currentArray;

  return { frontmatter: fm, body };
}

function chunkMarkdown(path, raw) {
  const { frontmatter, body } = parseFrontmatter(raw);
  const chunks = [];

  const baseMeta = {
    path,
    type: frontmatter.type || undefined,
    client: frontmatter.client || undefined,
  };

  const sections = body.split(/\n(?=## )/);
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < 10) continue;
    const headingMatch = trimmed.match(/^## (.+)/);
    chunks.push({
      content: trimmed,
      metadata: { ...baseMeta, section: headingMatch ? headingMatch[1] : undefined },
    });
  }

  if (chunks.length === 0 && body.trim().length > 10) {
    chunks.push({ content: body.trim(), metadata: baseMeta });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Supabase operations
// ---------------------------------------------------------------------------

async function deleteChunks(path) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/vault_documents?path=eq.${encodeURIComponent(path)}`,
    { method: 'DELETE', headers: sbHeaders },
  );
  if (!res.ok && res.status !== 404) {
    console.error(`  Delete failed for ${path}: ${res.status}`);
  }
}

async function upsertChunk(path, chunkIndex, content, metadata) {
  const row = {
    path,
    chunk_index: chunkIndex,
    content,
    metadata,
    token_count: Math.ceil(content.length / 4),
    updated_at: new Date().toISOString(),
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/vault_documents`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error(`  Upsert failed: ${res.status} ${t}`);
  }
}

// ---------------------------------------------------------------------------
// Walk & index
// ---------------------------------------------------------------------------

async function indexFile(path) {
  const content = await ghReadFile(path);
  if (!content) return 0;

  const chunks = chunkMarkdown(path, content);
  await deleteChunks(path);

  for (let i = 0; i < chunks.length; i++) {
    await upsertChunk(path, i, chunks[i].content, chunks[i].metadata);
  }

  return chunks.length;
}

async function walkDir(dirPath) {
  const items = await ghListDir(dirPath);
  let total = 0;

  for (const item of items) {
    if (item.type === 'dir') {
      total += await walkDir(item.path);
    } else if (item.name.endsWith('.md')) {
      const count = await indexFile(item.path);
      console.log(`  ${item.path} → ${count} chunk(s)`);
      total += count;
    }
  }

  return total;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Indexing vault into search database...\n');

  let totalChunks = 0;
  let totalFiles = 0;

  // Index client profiles
  console.log('Indexing Clients/...');
  const clientChunks = await walkDir('Clients');
  totalChunks += clientChunks;

  // Index templates
  console.log('\nIndexing Templates/...');
  try {
    totalChunks += await walkDir('Templates');
  } catch { /* may not exist */ }

  // Index root .md files
  console.log('\nIndexing root files...');
  const rootItems = await ghListDir('');
  for (const item of rootItems) {
    if (item.type === 'file' && item.name.endsWith('.md')) {
      const count = await indexFile(item.path);
      console.log(`  ${item.path} → ${count} chunk(s)`);
      totalChunks += count;
      totalFiles++;
    }
  }

  console.log(`\n✅ Indexed ${totalChunks} chunks across all files.`);
  console.log(`\nSearch mode: Full-text search (tsvector)`);
  if (!process.env.OPENAI_API_KEY) {
    console.log('Note: Add OPENAI_API_KEY for semantic vector search.');
  }
}

main().catch(e => console.error('Error:', e));
