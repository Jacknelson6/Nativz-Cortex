/**
 * Bidirectional sync between GitHub (AC Knowledge Graph repo) and Supabase.
 *
 * - syncFromGitHub: incremental import using Git Trees API (SHA comparison)
 * - writeNodeToGitHub: write-back a single node after create/edit in the app
 * - formatNodeAsMarkdown: formats a KnowledgeNode as YAML-frontmatter markdown
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { writeFile as vaultWriteFile, readFile as vaultReadFile } from '@/lib/vault/github';
import type { KnowledgeNode } from './graph-queries';

const GITHUB_API = 'https://api.github.com';
const DEFAULT_REPO = 'Jacknelson6/ac-knowledge-graph';
const BRANCH = 'main';

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
}

export async function syncFromGitHub(repoSlug: string = DEFAULT_REPO): Promise<SyncStats> {
  const token = getToken();
  const stats: SyncStats = { added: 0, updated: 0, unchanged: 0, errors: 0 };

  // 1. Fetch full tree via Trees API (single call)
  const treeRes = await fetch(
    `${GITHUB_API}/repos/${repoSlug}/git/trees/${BRANCH}?recursive=1`,
    { headers: ghHeaders(token) },
  );

  if (!treeRes.ok) {
    const msg = await treeRes.text();
    throw new Error(`GitHub Trees API failed (${treeRes.status}): ${msg}`);
  }

  const treeData = await treeRes.json();
  const allEntries: TreeEntry[] = treeData.tree ?? [];

  // 2. Filter for .md files in vault/ directory
  const mdFiles = allEntries.filter(
    (e) => e.type === 'blob' && e.path.startsWith('vault/') && e.path.endsWith('.md'),
  );

  if (mdFiles.length === 0) return stats;

  // 3. Query existing nodes from this repo
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

  // 4. Determine which files need fetching
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

  // 5. Fetch and upsert changed files (batched to avoid rate limits)
  const BATCH_SIZE = 10;
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        // Fetch file content via blob API
        const blobRes = await fetch(entry.url, { headers: ghHeaders(token) });

        if (blobRes.status === 403) {
          // Rate limited
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

        // Derive the node ID
        const kind = (fm.kind as string) ?? deriveKindFromPath(entry.path);
        const slug =
          (fm.id as string) ??
          entry.path
            .replace(/^vault\//, '')
            .replace(/\.md$/, '')
            .replace(/^[^/]+\//, '') // strip kind directory
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        const nodeId = `${kind}:${slug}`;
        const title = (fm.title as string) ?? slug.replace(/-/g, ' ');

        const domain = Array.isArray(fm.domain)
          ? fm.domain
          : typeof fm.domain === 'string'
            ? [fm.domain]
            : [];
        const tags = Array.isArray(fm.tags)
          ? fm.tags
          : typeof fm.tags === 'string'
            ? [fm.tags]
            : [];
        const connections = Array.isArray(fm.connections)
          ? fm.connections
          : typeof fm.connections === 'string'
            ? [fm.connections]
            : [];

        const existing = existingMap.get(entry.path);

        const nodeData = {
          id: existing?.id ?? nodeId,
          kind,
          title,
          domain,
          tags,
          connections,
          content: body.trim(),
          metadata: {} as Record<string, unknown>,
          source_repo: repoSlug,
          source_path: entry.path,
          source_sha: entry.sha,
          sync_status: 'synced',
          updated_at: new Date().toISOString(),
        };

        // Preserve any extra frontmatter fields in metadata
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

        const { error } = await admin.from('knowledge_nodes').upsert(nodeData, {
          onConflict: 'id',
        });

        if (error) {
          console.error(`Upsert failed for ${nodeId}:`, error.message);
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

  return stats;
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
    const repo = node.source_repo ?? DEFAULT_REPO;

    // Try to get existing file SHA for updates
    let existingSha: string | undefined;
    try {
      const existingRes = await fetch(
        `${GITHUB_API}/repos/${repo}/contents/${encodeURIPath(filePath)}?ref=${BRANCH}`,
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
      branch: BRANCH,
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
// Helpers
// ---------------------------------------------------------------------------

function deriveKindFromPath(filePath: string): string {
  // vault/skills/foo.md → skill (de-pluralize)
  const parts = filePath.replace(/^vault\//, '').split('/');
  if (parts.length < 2) return 'note';

  const dir = parts[0].toLowerCase();
  // Simple de-pluralize: remove trailing 's'
  if (dir.endsWith('ies')) return dir.slice(0, -3) + 'y'; // methodologies → methodology
  if (dir.endsWith('s') && !dir.endsWith('ss')) return dir.slice(0, -1);
  return dir;
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
