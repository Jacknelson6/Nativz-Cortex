import { createAdminClient } from '@/lib/supabase/admin';
import { embedKnowledgeEntry } from '@/lib/ai/embeddings';
import type {
  KnowledgeEntry,
  KnowledgeEntryType,
  KnowledgeLink,
  KnowledgeGraphData,
  KnowledgeNodeType,
  ExternalNode,
  TemporalMarker,
} from './types';
import { extractTemporalMarkers } from './temporal-extractor';
import { detectSupersessions } from './supersession-detector';

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function getKnowledgeEntries(
  clientId: string,
  type?: KnowledgeEntryType
): Promise<KnowledgeEntry[]> {
  const admin = createAdminClient();
  let query = admin
    .from('client_knowledge_entries')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch knowledge entries: ${error.message}`);
  return (data ?? []) as KnowledgeEntry[];
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export async function getKnowledgeLinks(clientId: string): Promise<KnowledgeLink[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('client_knowledge_links')
    .select('*')
    .eq('client_id', clientId);

  if (error) throw new Error(`Failed to fetch knowledge links: ${error.message}`);
  return (data ?? []) as KnowledgeLink[];
}

// ---------------------------------------------------------------------------
// External nodes (contacts, searches, strategies, idea submissions)
// ---------------------------------------------------------------------------

export async function getExternalNodes(
  clientId: string,
  links: KnowledgeLink[]
): Promise<ExternalNode[]> {
  // Collect unique external IDs grouped by type
  const idsByType = new Map<KnowledgeNodeType, Set<string>>();

  for (const link of links) {
    for (const side of ['source', 'target'] as const) {
      const nodeType = link[`${side}_type`] as KnowledgeNodeType;
      const nodeId = link[`${side}_id`];
      if (nodeType !== 'entry') {
        if (!idsByType.has(nodeType)) idsByType.set(nodeType, new Set());
        idsByType.get(nodeType)!.add(nodeId);
      }
    }
  }

  const admin = createAdminClient();
  const nodes: ExternalNode[] = [];

  // Batch-fetch each type
  const contactIds = [...(idsByType.get('contact') ?? [])];
  const searchIds = [...(idsByType.get('search') ?? [])];
  const strategyIds = [...(idsByType.get('strategy') ?? [])];
  const ideaIds = [...(idsByType.get('idea_submission') ?? [])];

  const fetches: Promise<void>[] = [];

  if (contactIds.length > 0) {
    fetches.push(
      admin
        .from('contacts')
        .select('id, full_name, role, created_at')
        .eq('client_id', clientId)
        .in('id', contactIds)
        .then(({ data, error }) => {
          if (error) console.error('Failed to fetch contacts for graph:', error);
          for (const row of data ?? []) {
            nodes.push({
              id: row.id,
              type: 'contact',
              title: row.full_name ?? '',
              subtitle: row.role ?? '',
              created_at: row.created_at ?? '',
            });
          }
        }) as Promise<void>
    );
  }

  if (searchIds.length > 0) {
    fetches.push(
      admin
        .from('topic_searches')
        .select('id, query, status, created_at')
        .eq('client_id', clientId)
        .in('id', searchIds)
        .then(({ data, error }) => {
          if (error) console.error('Failed to fetch topic_searches for graph:', error);
          for (const row of data ?? []) {
            nodes.push({
              id: row.id,
              type: 'search',
              title: row.query ?? '',
              subtitle: row.status ?? '',
              created_at: row.created_at ?? '',
            });
          }
        }) as Promise<void>
    );
  }

  if (strategyIds.length > 0) {
    fetches.push(
      admin
        .from('client_strategies')
        .select('id, executive_summary, created_at')
        .eq('client_id', clientId)
        .in('id', strategyIds)
        .then(({ data, error }) => {
          if (error) console.error('Failed to fetch client_strategies for graph:', error);
          for (const row of data ?? []) {
            const summary = (row.executive_summary as string) ?? '';
            nodes.push({
              id: row.id,
              type: 'strategy',
              title: 'Strategy',
              subtitle: summary.length > 100 ? summary.slice(0, 100) + '...' : summary,
              created_at: row.created_at ?? '',
            });
          }
        }) as Promise<void>
    );
  }

  if (ideaIds.length > 0) {
    fetches.push(
      admin
        .from('idea_submissions')
        .select('id, title, category, created_at')
        .eq('client_id', clientId)
        .in('id', ideaIds)
        .then(({ data, error }) => {
          if (error) console.error('Failed to fetch idea_submissions for graph:', error);
          for (const row of data ?? []) {
            nodes.push({
              id: row.id,
              type: 'idea_submission',
              title: row.title ?? '',
              subtitle: row.category ?? '',
              created_at: row.created_at ?? '',
            });
          }
        }) as Promise<void>
    );
  }

  await Promise.all(fetches);
  return nodes;
}

// ---------------------------------------------------------------------------
// Full graph
// ---------------------------------------------------------------------------

export async function getKnowledgeGraph(clientId: string): Promise<KnowledgeGraphData> {
  const [entries, links] = await Promise.all([
    getKnowledgeEntries(clientId),
    getKnowledgeLinks(clientId),
  ]);

  const externalNodes = await getExternalNodes(clientId, links);

  // Generate wikilink edges from entry content
  const { generateWikilinkEdges } = await import('./wikilinks');
  const wikilinkEdges = generateWikilinkEdges(entries);

  // Merge wikilink edges into links (avoid duplicates with existing links)
  const existingKeys = new Set(
    links.map((l) => [l.source_id, l.target_id].sort().join(':')),
  );

  for (const edge of wikilinkEdges) {
    const key = [edge.sourceEntryId, edge.targetEntryId].sort().join(':');
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      links.push({
        id: `wikilink-${key}`,
        client_id: clientId,
        source_id: edge.sourceEntryId,
        source_type: 'entry',
        target_id: edge.targetEntryId,
        target_type: 'entry',
        label: 'wikilink',
        created_at: '',
      });
    }
  }

  // Client knowledge graph: only this client’s entries + linked entities (contacts, searches, etc.).
  // Agency-wide knowledge_nodes (playbooks, domain hubs) stay on /admin/nerd/knowledge — not here.

  return { entries, links, externalNodes };
}

// ---------------------------------------------------------------------------
// CRUD — Entries
// ---------------------------------------------------------------------------

export async function createKnowledgeEntry(
  entry: Omit<KnowledgeEntry, 'id' | 'created_at' | 'updated_at'>,
  options?: { skipTemporalEnrichment?: boolean },
): Promise<KnowledgeEntry> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('client_knowledge_entries')
    .insert(entry)
    .select()
    .single();

  if (error) throw new Error(`Failed to create knowledge entry: ${error.message}`);

  // Auto-embed for semantic search (non-blocking)
  embedKnowledgeEntry(data.id).catch(() => {});

  // Temporal enrichment (non-blocking): extract markers + detect supersessions
  if (!options?.skipTemporalEnrichment) {
    processTemporalEnrichment(data as KnowledgeEntry).catch(() => {});
  }

  return data as KnowledgeEntry;
}

/**
 * Post-ingestion temporal processing: extract temporal markers from content,
 * detect supersessions against existing entries, and update accordingly.
 */
async function processTemporalEnrichment(entry: KnowledgeEntry): Promise<void> {
  const admin = createAdminClient();

  // 1. Extract temporal markers from content
  const extraction = await extractTemporalMarkers(entry.content, entry.title);

  const updates: Record<string, unknown> = {};
  if (extraction.markers.length > 0) {
    updates.temporal_markers = extraction.markers;
  }
  if (extraction.validFrom) {
    updates.valid_from = extraction.validFrom;
  }
  if (extraction.validUntil) {
    updates.valid_until = extraction.validUntil;
  }

  // Apply temporal marker updates if any were found
  if (Object.keys(updates).length > 0) {
    await admin
      .from('client_knowledge_entries')
      .update(updates)
      .eq('id', entry.id);
  }

  // 2. Detect supersessions against existing entries
  const supersessions = await detectSupersessions(
    entry.client_id,
    {
      title: entry.title,
      content: entry.content,
      type: entry.type,
      metadata: entry.metadata,
    },
    { excludeEntryIds: [entry.id] },
  );

  // Auto-apply high-confidence supersessions
  for (const s of supersessions.supersedes) {
    if (s.confidence < 0.8) continue;

    // Mark old entry as superseded
    await admin
      .from('client_knowledge_entries')
      .update({ superseded_by: entry.id })
      .eq('id', s.entryId);

    // Create a supersedes link
    await createKnowledgeLink({
      client_id: entry.client_id,
      source_id: entry.id,
      source_type: 'entry',
      target_id: s.entryId,
      target_type: 'entry',
      label: 'supersedes',
    });
  }

  // Create contradicts links (no auto-supersession, just record the relationship)
  for (const c of supersessions.contradicts) {
    if (c.confidence < 0.8) continue;

    await createKnowledgeLink({
      client_id: entry.client_id,
      source_id: entry.id,
      source_type: 'entry',
      target_id: c.entryId,
      target_type: 'entry',
      label: 'contradicts',
    });
  }
}

export async function updateKnowledgeEntry(
  id: string,
  updates: Partial<Pick<KnowledgeEntry, 'title' | 'content' | 'metadata' | 'client_visible'>>
): Promise<KnowledgeEntry> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('client_knowledge_entries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update knowledge entry: ${error.message}`);
  return data as KnowledgeEntry;
}

export async function deleteKnowledgeEntry(id: string): Promise<void> {
  const admin = createAdminClient();

  // Delete associated links (both directions)
  const { error: linksError } = await admin
    .from('client_knowledge_links')
    .delete()
    .or(`source_id.eq.${id},target_id.eq.${id}`);

  if (linksError) console.error('Failed to delete associated links:', linksError);

  const { error } = await admin
    .from('client_knowledge_entries')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete knowledge entry: ${error.message}`);
}

// ---------------------------------------------------------------------------
// CRUD — Links
// ---------------------------------------------------------------------------

export async function createKnowledgeLink(
  link: Omit<KnowledgeLink, 'id' | 'created_at'>
): Promise<KnowledgeLink> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('client_knowledge_links')
    .upsert(link, { onConflict: 'source_id,source_type,target_id,target_type' })
    .select()
    .single();

  if (error) throw new Error(`Failed to create knowledge link: ${error.message}`);
  return data as KnowledgeLink;
}

export async function deleteKnowledgeLink(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('client_knowledge_links')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete knowledge link: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Brand profile helper
// ---------------------------------------------------------------------------

export async function getBrandProfile(clientId: string): Promise<KnowledgeEntry | null> {
  const admin = createAdminClient();
  // Get the current (non-superseded) brand profile — superseded_by should be absent/null
  const { data, error } = await admin
    .from('client_knowledge_entries')
    .select('*')
    .eq('client_id', clientId)
    .eq('type', 'brand_profile')
    .is('metadata->superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch brand profile: ${error.message}`);
  return (data as KnowledgeEntry) ?? null;
}
