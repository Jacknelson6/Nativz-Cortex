/**
 * Normalizes Git-ingested markdown into Cortex KG field shapes aligned with
 * ALLOWED_NODE_KINDS and consistent arrays/titles for search + graph UI.
 */

import { ALLOWED_NODE_KINDS, type KnowledgeNodeKind } from './graph-queries';

const ALLOWED_SET = new Set<string>(ALLOWED_NODE_KINDS);

/** Legacy / path-derived kinds → canonical KG kind (graph-queries comment). */
const LEGACY_KIND_MAP: Record<string, KnowledgeNodeKind> = {
  skill: 'playbook',
  skills: 'playbook',
  sop: 'playbook',
  sops: 'playbook',
  pattern: 'insight',
  patterns: 'insight',
  methodology: 'playbook',
  methodologies: 'playbook',
  template: 'playbook',
  templates: 'playbook',
  moc: 'domain',
  mocs: 'domain',
  agent: 'playbook',
  agents: 'playbook',
  project: 'playbook',
  projects: 'playbook',
  note: 'playbook',
  notes: 'playbook',
  learning: 'insight',
  learnings: 'insight',
  playbook: 'playbook',
  playbooks: 'playbook',
  industry: 'insight',
  industries: 'insight',
  meeting: 'meeting',
  meetings: 'meeting',
  gdrive: 'asset',
  insight: 'insight',
  insights: 'insight',
};

export interface NormalizeIngestInput {
  rawKind: string;
  rawSlug: string;
  titleFromFm: string | undefined;
  body: string;
  domain: unknown;
  tags: unknown;
  connections: unknown;
}

export interface NormalizeIngestResult {
  kind: string;
  slug: string;
  title: string;
  domain: string[];
  tags: string[];
  connections: string[];
  /** When kind was remapped from raw (stored in metadata). */
  ingest_kind_raw?: string;
}

/**
 * Coerce YAML/frontmatter list fields to trimmed non-empty strings.
 */
export function coerceStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map((x) => (typeof x === 'string' ? x.trim() : String(x).trim()))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const t = value.trim();
    return t ? [t] : [];
  }
  return [];
}

function normalizeSlugSegment(slug: string): string {
  const s = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return s || 'untitled';
}

function firstMarkdownHeading(body: string): string | null {
  const m = body.match(/^\s*#\s+(.+)$/m);
  if (!m?.[1]) return null;
  const t = m[1].trim();
  return t || null;
}

function normalizeDisplayTitle(title: string | undefined, slug: string, body: string): string {
  const fromFm = typeof title === 'string' ? title.trim() : '';
  if (fromFm.length > 0) return collapseWhitespace(fromFm);
  const h1 = firstMarkdownHeading(body);
  if (h1) return collapseWhitespace(h1);
  const fromSlug = slug.replace(/-/g, ' ').trim();
  if (fromSlug.length > 0) {
    return fromSlug.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return 'Untitled';
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Map path- or frontmatter-derived kind to an ALLOWED_NODE_KINDS value.
 */
export function normalizeKgKind(rawKind: string): { kind: KnowledgeNodeKind; changed: boolean } {
  const k = rawKind.trim().toLowerCase();
  if (!k) return { kind: 'playbook', changed: true };
  if (ALLOWED_SET.has(k)) return { kind: k as KnowledgeNodeKind, changed: false };
  const mapped = LEGACY_KIND_MAP[k];
  if (mapped) return { kind: mapped, changed: true };
  return { kind: 'playbook', changed: true };
}

/**
 * Produce DB-ready fields for one ingested markdown file.
 */
export function normalizeKnowledgeIngest(input: NormalizeIngestInput): NormalizeIngestResult {
  const slug = normalizeSlugSegment(input.rawSlug);
  const { kind, changed } = normalizeKgKind(input.rawKind);
  const title = normalizeDisplayTitle(input.titleFromFm, slug, input.body);
  const domain = coerceStringList(input.domain);
  const tags = coerceStringList(input.tags);
  const connections = coerceStringList(input.connections);

  return {
    kind,
    slug,
    title,
    domain,
    tags,
    connections,
    ...(changed && input.rawKind.trim() ? { ingest_kind_raw: input.rawKind.trim().toLowerCase() } : {}),
  };
}
