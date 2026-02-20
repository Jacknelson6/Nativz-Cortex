/**
 * Vault indexer — chunks markdown content and stores in Supabase
 * for full-text and semantic search.
 *
 * Supports two search modes:
 *   1. Full-text search (tsvector) — always available, no extra API key
 *   2. Semantic vector search (pgvector) — requires OPENAI_API_KEY for embeddings
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { isVaultConfigured, listFiles, readFile } from '@/lib/vault/github';
import { parseFrontmatter } from '@/lib/vault/parser';

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

interface Chunk {
  content: string;
  metadata: {
    path: string;
    type?: string;
    client?: string;
    section?: string;
    [key: string]: unknown;
  };
}

/**
 * Split a markdown file into meaningful chunks.
 * Splits on ## headings, keeping frontmatter metadata on each chunk.
 */
function chunkMarkdown(path: string, raw: string): Chunk[] {
  const { frontmatter, body } = parseFrontmatter(raw);
  const chunks: Chunk[] = [];

  const baseMeta = {
    path,
    type: frontmatter.type as string | undefined,
    client: frontmatter.client as string | undefined,
  };

  // Split on ## headings
  const sections = body.split(/\n(?=## )/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < 10) continue;

    // Extract section heading
    const headingMatch = trimmed.match(/^## (.+)/);
    const sectionName = headingMatch ? headingMatch[1] : undefined;

    chunks.push({
      content: trimmed,
      metadata: {
        ...baseMeta,
        section: sectionName,
      },
    });
  }

  // If no sections found, store the whole body as one chunk
  if (chunks.length === 0 && body.trim().length > 10) {
    chunks.push({
      content: body.trim(),
      metadata: baseMeta,
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Embeddings (optional — requires OPENAI_API_KEY)
// ---------------------------------------------------------------------------

async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000), // Token limit safety
      }),
    });

    if (!res.ok) {
      console.error('Embedding API error:', res.status);
      return null;
    }

    const data = await res.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('generateEmbedding error:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

interface IndexResult {
  path: string;
  chunks: number;
  embedded: boolean;
}

/**
 * Index a single vault file into the search database.
 * Deletes existing chunks for the path and replaces with fresh ones.
 */
export async function indexVaultFile(path: string, content: string): Promise<IndexResult> {
  const adminClient = createAdminClient();
  const chunks = chunkMarkdown(path, content);

  // Delete existing chunks for this path
  await adminClient.from('vault_documents').delete().eq('path', path);

  if (chunks.length === 0) {
    return { path, chunks: 0, embedded: false };
  }

  let hasEmbeddings = false;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await generateEmbedding(chunk.content);

    const row: Record<string, unknown> = {
      path,
      chunk_index: i,
      content: chunk.content,
      metadata: chunk.metadata,
      token_count: Math.ceil(chunk.content.length / 4), // rough estimate
      updated_at: new Date().toISOString(),
    };

    if (embedding) {
      row.embedding = JSON.stringify(embedding);
      hasEmbeddings = true;
    }

    await adminClient.from('vault_documents').upsert(row, {
      onConflict: 'path,chunk_index',
    });
  }

  return { path, chunks: chunks.length, embedded: hasEmbeddings };
}

/**
 * Index all vault files into the search database.
 * Recursively walks the vault and indexes all .md files.
 */
export async function indexEntireVault(): Promise<{
  total: number;
  results: IndexResult[];
}> {
  if (!isVaultConfigured()) {
    throw new Error('Vault not configured');
  }

  const results: IndexResult[] = [];

  // Walk all directories
  async function walkDir(dirPath: string) {
    const items = await listFiles(dirPath);

    for (const item of items) {
      if (item.type === 'dir') {
        await walkDir(item.path);
      } else if (item.name.endsWith('.md')) {
        const file = await readFile(item.path);
        if (file) {
          const result = await indexVaultFile(item.path, file.content);
          results.push(result);
        }
      }
    }
  }

  // Index client profiles
  await walkDir('Clients');

  // Index templates
  try {
    await walkDir('Templates');
  } catch { /* may not exist */ }

  // Index root files (Dashboard.md, etc.)
  const rootFiles = await listFiles('');
  for (const item of rootFiles) {
    if (item.type === 'file' && item.name.endsWith('.md')) {
      const file = await readFile(item.path);
      if (file) {
        const result = await indexVaultFile(item.path, file.content);
        results.push(result);
      }
    }
  }

  const total = results.reduce((sum, r) => sum + r.chunks, 0);
  return { total, results };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface VaultSearchResult {
  id: string;
  path: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

/**
 * Search the vault using full-text search.
 */
export async function searchVaultFTS(
  query: string,
  limit = 10,
): Promise<VaultSearchResult[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc('search_vault_fts', {
    query_text: query,
    match_limit: limit,
  });

  if (error) {
    console.error('searchVaultFTS error:', error);
    return [];
  }

  return (data || []).map((row: { id: string; path: string; content: string; metadata: Record<string, unknown>; rank: number }) => ({
    id: row.id,
    path: row.path,
    content: row.content,
    metadata: row.metadata,
    score: row.rank,
  }));
}

/**
 * Search the vault using semantic vector similarity.
 * Falls back to FTS if no OPENAI_API_KEY is set.
 */
export async function searchVaultSemantic(
  query: string,
  limit = 10,
): Promise<VaultSearchResult[]> {
  const embedding = await generateEmbedding(query);

  if (!embedding) {
    // Fall back to full-text search
    return searchVaultFTS(query, limit);
  }

  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc('search_vault_semantic', {
    query_embedding: JSON.stringify(embedding),
    match_limit: limit,
    similarity_threshold: 0.5,
  });

  if (error) {
    console.error('searchVaultSemantic error:', error);
    // Fall back to FTS
    return searchVaultFTS(query, limit);
  }

  return (data || []).map((row: { id: string; path: string; content: string; metadata: Record<string, unknown>; similarity: number }) => ({
    id: row.id,
    path: row.path,
    content: row.content,
    metadata: row.metadata,
    score: row.similarity,
  }));
}
