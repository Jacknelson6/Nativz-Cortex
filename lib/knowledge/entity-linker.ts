import { createAdminClient } from '@/lib/supabase/admin';
import { createKnowledgeLink } from './queries';

// ---------------------------------------------------------------------------
// Auto-link entities
// ---------------------------------------------------------------------------

export async function autoLinkEntities(
  clientId: string,
  newEntryId: string
): Promise<void> {
  const admin = createAdminClient();

  // 1. Read the new entry's metadata.entities
  const { data: entry, error: entryError } = await admin
    .from('client_knowledge_entries')
    .select('id, metadata')
    .eq('id', newEntryId)
    .single();

  if (entryError || !entry) {
    console.error('autoLinkEntities: failed to read entry', entryError);
    return;
  }

  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  const entities = metadata.entities as {
    people?: { name: string }[];
    products?: { name: string }[];
    locations?: { address: string }[];
  } | undefined;

  if (!entities) return;

  // Collect all entity names to search for
  const entityNames: { name: string; entityType: string }[] = [];

  for (const person of entities.people ?? []) {
    if (person.name) entityNames.push({ name: person.name, entityType: 'person' });
  }
  for (const product of entities.products ?? []) {
    if (product.name) entityNames.push({ name: product.name, entityType: 'product' });
  }
  for (const location of entities.locations ?? []) {
    if (location.address) entityNames.push({ name: location.address, entityType: 'location' });
  }

  if (entityNames.length === 0) return;

  // 2. Search existing entries for matching entity names
  const { data: existingEntries, error: existingError } = await admin
    .from('client_knowledge_entries')
    .select('id, title, content')
    .eq('client_id', clientId)
    .neq('id', newEntryId);

  if (existingError) {
    console.error('autoLinkEntities: failed to fetch existing entries', existingError);
    return;
  }

  // 3. Check contacts table for matching people
  const peopleNames = entityNames
    .filter((e) => e.entityType === 'person')
    .map((e) => e.name);

  let matchedContactIds: string[] = [];

  if (peopleNames.length > 0) {
    // Build an OR filter for case-insensitive substring matches on full_name
    const orFilter = peopleNames
      .map((name) => `full_name.ilike.%${name}%`)
      .join(',');

    const { data: contacts } = await admin
      .from('contacts')
      .select('id, full_name')
      .eq('client_id', clientId)
      .or(orFilter);

    if (contacts && contacts.length > 0) {
      matchedContactIds = contacts.map((c) => c.id);

      // Create links to contacts
      for (const contact of contacts) {
        try {
          await createKnowledgeLink({
            client_id: clientId,
            source_id: newEntryId,
            source_type: 'entry',
            target_id: contact.id,
            target_type: 'contact',
            label: `shared_entity:person:${contact.full_name}`,
          });
        } catch (err) {
          console.error('autoLinkEntities: failed to create contact link', err);
        }
      }
    }
  }

  // 4. Match against existing knowledge entries (case-insensitive substring on title + content)
  const linkedEntryIds = new Set<string>();

  for (const entity of entityNames) {
    const needle = entity.name.toLowerCase();

    for (const existing of existingEntries ?? []) {
      if (linkedEntryIds.has(existing.id)) continue;

      const titleMatch = (existing.title ?? '').toLowerCase().includes(needle);
      const contentMatch = (existing.content ?? '').toLowerCase().includes(needle);

      if (titleMatch || contentMatch) {
        linkedEntryIds.add(existing.id);

        try {
          await createKnowledgeLink({
            client_id: clientId,
            source_id: newEntryId,
            source_type: 'entry',
            target_id: existing.id,
            target_type: 'entry',
            label: `shared_entity:${entity.entityType}:${entity.name}`,
          });
        } catch (err) {
          console.error('autoLinkEntities: failed to create entry link', err);
        }
      }
    }
  }
}
