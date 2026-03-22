/**
 * Bidirectional sync between GitHub (AC Knowledge Graph repo) and Supabase.
 *
 * - syncFromGitHub: incremental import using Git Trees API (SHA comparison)
 * - Strict mirror (default): deletes knowledge_nodes rows under each source’s
 *   pathPrefixes when the file no longer exists in Git (see sync-sources.ts).
 * - Ingest normalization (kg-ingest-normalize): maps legacy kinds → ALLOWED_NODE_KINDS,
 *   slugifies ids, derives title from # heading when missing, coerces list fields.
 * - writeNodeToGitHub: write-back a single node after create/edit in the app
 * - formatNodeAsMarkdown: formats a KnowledgeNode as YAML-frontmatter markdown
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { KnowledgeNode } from './graph-queries';
import { KNOWLEDGE_GRAPH_GITHUB_REPO } from './github-repo';
import type { KnowledgeSyncSource } from './sync-sources';
import { getKnowledgeSyncSources, shouldPruneKnowledgeOrphans } from './sync-sources';
import { normalizeKnowledgeIngest } from './kg-ingest-normalize';

const GITHUB_API = 'https://api.github.com';
const DEFAULT_BRANCH = 'main';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getToken(): string {
  const token = process.env.GITHUB_VAULT_TOKEN;
  if (!token) throw new Error('GITHUB_VAULT_TOKEN is not set');
  return token;
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Frontmatter parser (inline — mirrors lib/vault/parser.ts pattern)
// ---------------------------------------------------------------------------

interface KGFrontmatter {
  id?: string;
  kind?: string;
  title?: string;
  domain?: string[];
  tags?: string[];
  connections?: string[];
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

function parseFrontmatter(raw: string): { frontmatter: KGFrontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const fmBlock = match[1];
  const body = match[2];
  const fm: KGFrontmatter = {};

  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of fmBlock.split('\n')) {
    const kvMatch = line.match(/^(\w[\w_]*?):\s*(.*)$/);
    if (kvMatch) {
      // Save previous array
      if (currentKey && currentArray) {
        fm[currentKey] = currentArray;
        currentArray = null;
      }

      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();

      if (val === '') {
        currentArray = [];
      } else if (val === 'true') {
        fm[currentKey] = true;
        currentKey = null;
      } else if (val === 'false') {
        fm[currentKey] = false;
        currentKey = null;
      } else if (val.startsWith('[') && val.endsWith(']')) {
        // Inline array: [a, b, c]
        fm[currentKey] = val
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        currentKey = null;
      } else {
        fm[currentKey] = val.replace(/^["']|["']$/g, '');
        currentKey = null;
      }
    } else if (currentArray !== null && line.match(/^\s+-\s/)) {
      const item = line.replace(/^\s+-\s*/, '').replace(/^["']|["']$/g, '');
      currentArray.push(item);
    }
  }

  if (currentKey && currentArray) {
    fm[currentKey] = currentArray;
  }

  return { frontmatter: fm, body };
}

// ---------------------------------------------------------------------------
// syncFromGitHub — incremental import using Git Trees API
// ---------------------------------------------------------------------------

interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
  url: string;
}

export interface SyncStats {
  added: number;
  updated: number;
  unchanged: number;
  errors: number;
  /** Rows removed from knowledge_nodes (strict mirror — file gone from Git). */
  removed: number;
}

/**
 * Incremental sync for one configured source (repo + path prefixes + optional id namespace).
 */
export async function syncKnowledgeSource(source: KnowledgeSyncSource): Promise<SyncStats> {
  const repoSlug = source.repo;
  const branch = source.branch ?? DEFAULT_BRANCH;
  const token = getToken();
  const stats: SyncStats = { added: 0, updated: 0, unchanged: 0, errors: 0, removed: 0 };

  const treeRes = await fetch(
    `${GITHUB_API}/repos/${repoSlug}/git/trees/${branch}?recursive=1`,
    { headers: ghHeaders(token) },
  );

  if (!treeRes.ok) {
    const msg = await treeRes.text();
    throw new Error(`GitHub Trees API failed (${treeRes.status}): ${msg}`);
  }

  const treeData = await treeRes.json();
  const allEntries: TreeEntry[] = treeData.tree ?? [];

  const mdFiles = allEntries.filter(
    (e) =>
      e.type === 'blob' &&
      e.path.endsWith('.md') &&
      source.pathPrefixes.some((prefix) => e.path.startsWith(prefix)),
  );

  const syncedPaths = new Set(mdFiles.map((e) => e.path));

  const admin = createAdminClient();
  const { data: existingRows } = await admin
    .from('knowledge_nodes')
    .select('id, source_path, source_sha')
    .eq('source_repo', repoSlug);

  const existingMap = new Map<string, { id: string; sha: string }>();
  for (const row of existingRows ?? []) {
    if (row.source_path) {
      existingMap.set(row.source_path, { id: row.id, sha: row.source_sha ?? '' });
    }
  }

  const toFetch: TreeEntry[] = [];
  for (const entry of mdFiles) {
    const existing = existingMap.get(entry.path);
    if (!existing) {
      toFetch.push(entry);
    } else if (existing.sha !== entry.sha) {
      toFetch.push(entry);
    } else {
      stats.unchanged++;
    }
  }

  const BATCH_SIZE = 10;
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        const blobRes = await fetch(entry.url, { headers: ghHeaders(token) });

        if (blobRes.status === 403) {
          throw new Error('GitHub rate limit hit');
        }

        if (!blobRes.ok) {
          throw new Error(`Failed to fetch blob ${entry.path}: ${blobRes.status}`);
        }

        const blobData = await blobRes.json();
        const content = Buffer.from(blobData.content, 'base64').toString('utf-8');

        return { entry, content };
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('GitHub sync fetch error:', result.reason);
        stats.errors++;
        continue;
      }

      const { entry, content } = result.value;

      try {
        const { frontmatter: fm, body } = parseFrontmatter(content);
        const derived = deriveKindAndSlugFromSourcePath(entry.path, source, fm);
        const normalized = normalizeKnowledgeIngest({
          rawKind: derived.kind,
          rawSlug: derived.slug,
          titleFromFm: typeof fm.title === 'string' ? fm.title : undefined,
          body,
          domain: fm.domain,
          tags: fm.tags,
          connections: fm.connections,
        });

        const existing = existingMap.get(entry.path);
        const logicalId =
          existing?.id ??
          (source.idNamespace
            ? `${source.idNamespace}:${normalized.kind}:${normalized.slug}`
            : `${normalized.kind}:${normalized.slug}`);

        const nodeData = {
          id: logicalId,
          kind: normalized.kind,
          title: normalized.title,
          domain: normalized.domain,
          tags: normalized.tags,
          connections: normalized.connections,
          content: body.trim(),
          metadata: {} as Record<string, unknown>,
          source_repo: repoSlug,
          source_path: entry.path,
          source_sha: entry.sha,
          sync_status: 'synced',
          updated_at: new Date().toISOString(),
        };

        const knownKeys = new Set([
          'id',
          'kind',
          'title',
          'domain',
          'tags',
          'connections',
          'created',
          'updated',
        ]);
        for (const [k, v] of Object.entries(fm)) {
          if (!knownKeys.has(k)) {
            nodeData.metadata[k] = v;
          }
        }
        if (source.idNamespace) {
          nodeData.metadata.source_collection = source.idNamespace;
        }
        if (normalized.ingest_kind_raw) {
          nodeData.metadata.ingest_kind_raw = normalized.ingest_kind_raw;
        }

        const { error } = await admin.from('knowledge_nodes').upsert(nodeData, {
          onConflict: 'id',
        });

        if (error) {
          console.error(`Upsert failed for ${logicalId}:`, error.message);
          stats.errors++;
        } else {
          existing ? stats.updated++ : stats.added++;
        }
      } catch (err) {
        console.error(`Parse/upsert error for ${entry.path}:`, err);
        stats.errors++;
      }
    }
  }

  if (shouldPruneKnowledgeOrphans(source)) {
    stats.removed = await pruneOrphanedKnowledgeNodes(
      admin,
      repoSlug,
      source.pathPrefixes,
      syncedPaths,
    );
  }

  return stats;
}

/**
 * Sync every entry in KNOWLEDGE_GRAPH_SYNC_SOURCES (or the legacy default).
 */
export async function syncAllKnowledgeSources(): Promise<Record<string, SyncStats>> {
  const sources = getKnowledgeSyncSources();
  const out: Record<string, SyncStats> = {};
  for (const source of sources) {
    const key = `${source.repo}::${source.pathPrefixes.join('|')}`;
    out[key] = await syncKnowledgeSource(source);
  }
  return out;
}

/**
 * Sync by repo slug. If the repo appears multiple times in config (different prefixes),
 * runs each slice sequentially and returns aggregated counts.
 */
export async function syncFromGitHub(repoSlug: string = KNOWLEDGE_GRAPH_GITHUB_REPO): Promise<SyncStats> {
  const matches = getKnowledgeSyncSources().filter((s) => s.repo === repoSlug);
  if (matches.length === 0) {
    return syncKnowledgeSource({
      repo: repoSlug,
      pathPrefixes: ['vault/'],
      branch: DEFAULT_BRANCH,
    });
  }

  const aggregate: SyncStats = { added: 0, updated: 0, unchanged: 0, errors: 0, removed: 0 };
  for (const source of matches) {
    const st = await syncKnowledgeSource(source);
    aggregate.added += st.added;
    aggregate.updated += st.updated;
    aggregate.unchanged += st.unchanged;
    aggregate.errors += st.errors;
    aggregate.removed += st.removed;
  }
  return aggregate;
}

// ---------------------------------------------------------------------------
// writeNodeToGitHub — write a single node back after create/edit
// ---------------------------------------------------------------------------

export async function writeNodeToGitHub(node: KnowledgeNode): Promise<void> {
  const admin = createAdminClient();

  try {
    const token = getToken();
    const markdown = formatNodeAsMarkdown(node);

    // Determine file path
    const filePath = node.source_path ?? generateFilePath(node);

    // Determine which repo to write to
    const repo = node.source_repo ?? KNOWLEDGE_GRAPH_GITHUB_REPO;

    // Try to get existing file SHA for updates
    let existingSha: string | undefined;
    try {
      const existingRes = await fetch(
        `${GITHUB_API}/repos/${repo}/contents/${encodeURIPath(filePath)}?ref=${DEFAULT_BRANCH}`,
        { headers: ghHeaders(token) },
      );
      if (existingRes.ok) {
        const existingData = await existingRes.json();
        existingSha = existingData.sha;
      }
    } catch {
      // File doesn't exist yet — that's fine
    }

    // PUT the file
    const putBody: Record<string, string> = {
      message: `Update ${node.title} via Cortex`,
      content: Buffer.from(markdown, 'utf-8').toString('base64'),
      branch: DEFAULT_BRANCH,
    };
    if (existingSha) putBody.sha = existingSha;

    const putRes = await fetch(
      `${GITHUB_API}/repos/${repo}/contents/${encodeURIPath(filePath)}`,
      {
        method: 'PUT',
        headers: ghHeaders(token),
        body: JSON.stringify(putBody),
      },
    );

    if (putRes.status === 403) {
      // Rate limited or forbidden
      await admin
        .from('knowledge_nodes')
        .update({ sync_status: 'failed' })
        .eq('id', node.id);
      console.error(`GitHub write-back rate limited for ${node.id}`);
      return;
    }

    if (!putRes.ok) {
      const errText = await putRes.text();
      await admin
        .from('knowledge_nodes')
        .update({ sync_status: 'failed' })
        .eq('id', node.id);
      console.error(`GitHub write-back failed for ${node.id}: ${putRes.status} ${errText}`);
      return;
    }

    const putData = await putRes.json();
    const newSha = putData.content?.sha ?? null;

    // Update Supabase with new SHA and synced status
    await admin
      .from('knowledge_nodes')
      .update({
        source_sha: newSha,
        source_path: filePath,
        source_repo: repo,
        sync_status: 'synced',
      })
      .eq('id', node.id);
  } catch (err) {
    console.error(`GitHub write-back error for ${node.id}:`, err);
    try {
      await admin
        .from('knowledge_nodes')
        .update({ sync_status: 'failed' })
        .eq('id', node.id);
    } catch {
      // swallow nested errors
    }
  }
}

// ---------------------------------------------------------------------------
// formatNodeAsMarkdown
// ---------------------------------------------------------------------------

export function formatNodeAsMarkdown(node: KnowledgeNode): string {
  const slug = node.id.includes(':') ? node.id.split(':').slice(1).join(':') : node.id;

  const lines: string[] = ['---'];
  lines.push(`id: ${slug}`);
  lines.push(`kind: ${node.kind}`);
  lines.push(`title: ${node.title}`);

  if (node.domain.length > 0) {
    lines.push('domain:');
    for (const d of node.domain) lines.push(`  - ${d}`);
  } else {
    lines.push('domain: []');
  }

  if (node.tags.length > 0) {
    lines.push('tags:');
    for (const t of node.tags) lines.push(`  - ${t}`);
  } else {
    lines.push('tags: []');
  }

  if (node.connections.length > 0) {
    lines.push('connections:');
    for (const c of node.connections) lines.push(`  - ${c}`);
  } else {
    lines.push('connections: []');
  }

  lines.push(`created: ${node.created_at}`);
  lines.push(`updated: ${node.updated_at}`);
  lines.push('---');
  lines.push('');
  lines.push(node.content ?? '');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Strict mirror — remove nodes whose Git file disappeared
// ---------------------------------------------------------------------------

type AdminClient = ReturnType<typeof createAdminClient>;

async function pruneOrphanedKnowledgeNodes(
  admin: AdminClient,
  repoSlug: string,
  pathPrefixes: string[],
  syncedPaths: Set<string>,
): Promise<number> {
  const { data: rows, error } = await admin
    .from('knowledge_nodes')
    .select('id, source_path')
    .eq('source_repo', repoSlug);

  if (error) {
    console.error('[knowledge-sync] prune: failed to list nodes:', error.message);
    return 0;
  }

  const toDelete = (rows ?? []).filter((r) => {
    const p = r.source_path;
    if (!p || typeof p !== 'string') return false;
    const underPrefix = pathPrefixes.some((prefix) => p.startsWith(prefix));
    if (!underPrefix) return false;
    return !syncedPaths.has(p);
  });

  const DELETE_BATCH = 80;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += DELETE_BATCH) {
    const batch = toDelete.slice(i, i + DELETE_BATCH);
    const ids = batch.map((b) => b.id);
    const { error: delErr } = await admin.from('knowledge_nodes').delete().in('id', ids);
    if (delErr) {
      console.error('[knowledge-sync] prune: delete batch failed:', delErr.message);
      continue;
    }
    deleted += batch.length;
  }

  if (deleted > 0) {
    console.log(`[knowledge-sync] prune: removed ${deleted} orphan node(s) for ${repoSlug}`);
  }

  return deleted;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripLongestPathPrefix(path: string, prefixes: string[]): string | null {
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    if (path.startsWith(p)) return path.slice(p.length);
  }
  return null;
}

function slugifySegment(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function depluralizeDir(dir: string): string {
  const d = dir.toLowerCase();
  if (d.endsWith('ies')) return d.slice(0, -3) + 'y';
  if (d.endsWith('s') && !d.endsWith('ss')) return d.slice(0, -1);
  return d;
}

/**
 * Maps a repo file path + source config to kind and slug, mirroring the legacy
 * vault rule: first directory under the root = kind folder; remainder = slug path.
 */
function deriveKindAndSlugFromSourcePath(
  fullPath: string,
  source: KnowledgeSyncSource,
  fm: KGFrontmatter,
): { kind: string; slug: string } {
  const rel = stripLongestPathPrefix(fullPath, source.pathPrefixes);
  if (!rel) {
    return { kind: 'note', slug: slugifySegment(fullPath.replace(/\.md$/, '')) };
  }

  const withoutMd = rel.endsWith('.md') ? rel.slice(0, -3) : rel;
  const segments = withoutMd.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { kind: source.defaultKind ?? 'note', slug: 'untitled' };
  }

  if (segments.length === 1) {
    const kind =
      (fm.kind as string) ?? source.defaultKind ?? 'note';
    const slug =
      (fm.id as string) ?? slugifySegment(segments[0] ?? 'untitled');
    return { kind, slug };
  }

  const kindDir = segments[0] ?? 'note';
  const kind = (fm.kind as string) ?? depluralizeDir(kindDir);
  const tail = segments.slice(1).join('/');
  const slug =
    (fm.id as string) ??
    slugifySegment(tail || (segments[segments.length - 1] ?? kindDir));
  return { kind, slug };
}

function generateFilePath(node: KnowledgeNode): string {
  const slug = node.id.includes(':') ? node.id.split(':').slice(1).join(':') : node.id;

  // Pluralize the kind for the directory
  let kindDir = node.kind;
  if (kindDir.endsWith('y') && !kindDir.endsWith('ey')) {
    kindDir = kindDir.slice(0, -1) + 'ies'; // methodology → methodologies
  } else if (!kindDir.endsWith('s')) {
    kindDir = kindDir + 's';
  }

  return `vault/${kindDir}/${slug}.md`;
}

function encodeURIPath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
