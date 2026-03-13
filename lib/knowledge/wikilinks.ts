/**
 * Obsidian-style wikilink parser and resolver for the knowledge base.
 *
 * Wikilinks use `[[Entry Title]]` syntax in entry content to create
 * bidirectional connections between knowledge entries.
 */

// ── Parser ────────────────────────────────────────────────────────────────────

const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;

/** Extract all wikilink titles from content. */
export function extractWikilinks(content: string): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_REGEX.exec(content)) !== null) {
    matches.push(match[1].trim());
  }
  return [...new Set(matches)]; // dedupe
}

/** Check if content contains any wikilinks. */
export function hasWikilinks(content: string): boolean {
  return WIKILINK_REGEX.test(content);
}

// ── Resolver ──────────────────────────────────────────────────────────────────

interface EntryStub {
  id: string;
  title: string;
}

/**
 * Build a title → entry ID lookup map.
 * Matches are case-insensitive and trimmed.
 */
export function buildTitleIndex(entries: EntryStub[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of entries) {
    index.set(entry.title.toLowerCase().trim(), entry.id);
  }
  return index;
}

/**
 * Resolve wikilink titles to entry IDs using a title index.
 * Returns an array of { title, entryId } for each resolved link.
 * Unresolved links (no matching entry) are excluded.
 */
export function resolveWikilinks(
  content: string,
  titleIndex: Map<string, string>,
): { title: string; entryId: string }[] {
  const titles = extractWikilinks(content);
  const resolved: { title: string; entryId: string }[] = [];

  for (const title of titles) {
    const entryId = titleIndex.get(title.toLowerCase().trim());
    if (entryId) {
      resolved.push({ title, entryId });
    }
  }

  return resolved;
}

// ── Edge generation ───────────────────────────────────────────────────────────

export interface WikilinkEdge {
  sourceEntryId: string;
  targetEntryId: string;
  label: string;
}

/**
 * Scan all entries for wikilinks and generate edges.
 * Returns edges that can be added to the knowledge graph.
 */
export function generateWikilinkEdges(
  entries: { id: string; title: string; content: string | null }[],
): WikilinkEdge[] {
  const titleIndex = buildTitleIndex(entries);
  const edges: WikilinkEdge[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry.content) continue;

    const resolved = resolveWikilinks(entry.content, titleIndex);
    for (const link of resolved) {
      if (link.entryId === entry.id) continue; // skip self-links

      // Deduplicate bidirectional (A→B and B→A count as one)
      const key = [entry.id, link.entryId].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);

      edges.push({
        sourceEntryId: entry.id,
        targetEntryId: link.entryId,
        label: 'wikilink',
      });
    }
  }

  return edges;
}
