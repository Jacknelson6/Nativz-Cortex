/**
 * Declarative GitHub → knowledge_nodes sync sources.
 *
 * Set KNOWLEDGE_GRAPH_SYNC_SOURCES to a JSON array. Each entry defines one repo
 * slice (path prefixes, optional id namespace, branch). Omit the env var to use
 * the legacy single-source default: KNOWLEDGE_GRAPH_GITHUB_REPO + vault/** only,
 * with ids `kind:slug` (no namespace).
 *
 * Strict mirror (default on): after each sync, rows in `knowledge_nodes` with
 * matching `source_repo` and `source_path` under this source’s `pathPrefixes`
 * but absent from the Git tree are deleted. Disable globally with
 * KNOWLEDGE_GRAPH_STRICT_MIRROR=false, or per entry with "strictMirror": false.
 *
 * Example (primary vault + AC docs — Markdown lives in ac-docs/knowledge/):
 * [
 *   { "repo": "Jacknelson6/Cortex-Knowledge-Graph", "pathPrefixes": ["vault/"] },
 *   {
 *     "repo": "Anderson-Collaborative/ac-docs",
 *     "pathPrefixes": ["knowledge/"],
 *     "idNamespace": "ac-docs",
 *     "defaultKind": "playbook"
 *   }
 * ]
 */

import { KNOWLEDGE_GRAPH_GITHUB_REPO } from './github-repo';

export interface KnowledgeSyncSource {
  repo: string;
  /** e.g. ["vault/"] or ["docs/", "content/"] — markdown must live under one of these */
  pathPrefixes: string[];
  branch?: string;
  /**
   * When set, node ids are `${idNamespace}:${kind}:${slug}` so this repo cannot
   * clobber the primary vault’s `kind:slug` rows.
   */
  idNamespace?: string;
  /** Used when a file sits directly under a prefix (no subfolder), e.g. docs/index.md */
  defaultKind?: string;
  /**
   * When false, skip orphan deletes for this slice (Git tree is not authoritative).
   * Omit for default strict mirror (unless KNOWLEDGE_GRAPH_STRICT_MIRROR=false).
   */
  strictMirror?: boolean;
}

const DEFAULT_BRANCH = 'main';

function parseSourcesJson(raw: string): KnowledgeSyncSource[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: KnowledgeSyncSource[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const repo = typeof o.repo === 'string' ? o.repo.trim() : '';
      const prefixes = o.pathPrefixes;
      if (!repo || !Array.isArray(prefixes) || prefixes.length === 0) return null;
      const pathPrefixes = prefixes
        .filter((p): p is string => typeof p === 'string' && p.length > 0)
        .map((p) => (p.endsWith('/') ? p : `${p}/`));
      if (pathPrefixes.length === 0) return null;

      const branch = typeof o.branch === 'string' ? o.branch.trim() : undefined;
      const idNamespace =
        typeof o.idNamespace === 'string' && o.idNamespace.trim() !== ''
          ? o.idNamespace.trim()
          : undefined;
      const defaultKind =
        typeof o.defaultKind === 'string' && o.defaultKind.trim() !== ''
          ? o.defaultKind.trim()
          : undefined;
      const strictMirror = typeof o.strictMirror === 'boolean' ? o.strictMirror : undefined;

      out.push({
        repo,
        pathPrefixes,
        branch: branch || DEFAULT_BRANCH,
        idNamespace,
        defaultKind,
        strictMirror,
      });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Resolved sync sources from env (or legacy default).
 */
export function getKnowledgeSyncSources(): KnowledgeSyncSource[] {
  const raw = process.env.KNOWLEDGE_GRAPH_SYNC_SOURCES?.trim();
  if (raw) {
    const parsed = parseSourcesJson(raw);
    if (parsed) return parsed;
    console.warn(
      '[knowledge-sync] KNOWLEDGE_GRAPH_SYNC_SOURCES is set but invalid JSON; falling back to default single source.',
    );
  }

  return [
    {
      repo: KNOWLEDGE_GRAPH_GITHUB_REPO,
      pathPrefixes: ['vault/'],
      branch: DEFAULT_BRANCH,
    },
  ];
}

export function getKnowledgeSyncSourceForRepo(repoFullName: string): KnowledgeSyncSource | undefined {
  const normalized = repoFullName.trim().toLowerCase();
  return getKnowledgeSyncSources().find((s) => s.repo.trim().toLowerCase() === normalized);
}

export function branchRefMatchesSource(ref: string, source: KnowledgeSyncSource): boolean {
  const branch = source.branch ?? DEFAULT_BRANCH;
  return ref === `refs/heads/${branch}`;
}

/**
 * Whether to delete DB rows that no longer exist in Git for each sync source.
 * Default true; set KNOWLEDGE_GRAPH_STRICT_MIRROR=false or 0 to disable all pruning.
 */
export function isKnowledgeStrictMirrorEnabled(): boolean {
  const v = process.env.KNOWLEDGE_GRAPH_STRICT_MIRROR?.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off') return false;
  return true;
}

/** Per-source strict mirror: global on, and source did not opt out. */
export function shouldPruneKnowledgeOrphans(source: KnowledgeSyncSource): boolean {
  return isKnowledgeStrictMirrorEnabled() && source.strictMirror !== false;
}
