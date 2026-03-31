/**
 * Vault sync for knowledge entries.
 * Pushes knowledge entries to the Obsidian vault as markdown with wiki-links.
 * Non-blocking — vault failures never break core flows.
 */

import { isVaultConfigured, writeFile } from '@/lib/vault/github';
import type { KnowledgeEntry, KnowledgeEntryType, KnowledgeLink } from '@/lib/knowledge/types';

/** Replace characters that are invalid in file paths and cap length. */
function sanitize(name: string, maxLength = 80): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength);
}

/** Build the vault file path for a knowledge entry. */
function vaultPath(clientName: string, entry: KnowledgeEntry): string {
  const base = `Clients/${sanitize(clientName)}/Knowledge`;
  const title = sanitize(entry.title);

  const subfolders: Record<KnowledgeEntryType, string | null> = {
    brand_profile: null,
    brand_guideline: null,
    brand_asset: 'Assets',
    web_page: 'Web',
    document: 'Documents',
    note: 'Notes',
    idea: 'Ideas',
    meeting: 'Meetings',
    meeting_note: 'Meetings',
    decision: 'Meetings/Decisions',
    action_item: 'Meetings/Actions',
    guideline: 'Guidelines',
    person: 'People',
    competitor: 'Competitors',
    claim: 'Claims',
    campaign: 'Campaigns',
    product: 'Products',
    insight: 'Insights',
    // Brand DNA sub-types
    visual_identity: 'Brand DNA',
    verbal_identity: 'Brand DNA',
    target_audience: 'Brand DNA',
    competitive_positioning: 'Brand DNA',
    product_catalog: 'Brand DNA',
    brand_logo: 'Brand DNA/Logos',
    brand_screenshot: 'Brand DNA/Screenshots',
  };

  const subfolder = subfolders[entry.type];

  if (entry.type === 'brand_profile') {
    return `${base}/Brand Profile.md`;
  }

  return `${base}/${subfolder}/${title}.md`;
}

/** Collect links where this entry is source or target. */
function relevantLinks(
  entryId: string,
  links: KnowledgeLink[],
  linkedTitles: Map<string, string>,
): Array<{ title: string; label: string }> {
  const result: Array<{ title: string; label: string }> = [];

  for (const link of links) {
    if (link.source_id === entryId) {
      const title = linkedTitles.get(link.target_id);
      if (title) result.push({ title, label: link.label });
    } else if (link.target_id === entryId) {
      const title = linkedTitles.get(link.source_id);
      if (title) result.push({ title, label: link.label });
    }
  }

  return result;
}

/** Format a knowledge entry as markdown with frontmatter and wiki-links. */
function formatEntry(
  entry: KnowledgeEntry,
  links: KnowledgeLink[],
  linkedTitles: Map<string, string>,
): string {
  const lines: string[] = [
    '---',
    `type: ${entry.type}`,
    `source: ${entry.source}`,
    `created: ${entry.created_at}`,
    '---',
    '',
    `# ${entry.title}`,
    '',
    entry.content,
  ];

  const related = relevantLinks(entry.id, links, linkedTitles);

  if (related.length > 0) {
    lines.push('', '## Related');
    for (const r of related) {
      lines.push(`- [[${r.title}]] (${r.label})`);
    }
  }

  return lines.join('\n') + '\n';
}

/** Sync a single knowledge entry to the Obsidian vault. */
export async function syncKnowledgeEntryToVault(
  entry: KnowledgeEntry,
  clientName: string,
  links: KnowledgeLink[],
  linkedTitles: Map<string, string>,
): Promise<void> {
  if (!isVaultConfigured()) return;

  try {
    const path = vaultPath(clientName, entry);
    const markdown = formatEntry(entry, links, linkedTitles);
    await writeFile(path, markdown, `knowledge: ${entry.title}`);
  } catch (error) {
    console.error('Vault sync (knowledge) failed:', error);
  }
}

/** Sync all knowledge entries for a client to the vault. */
export async function syncAllKnowledgeToVault(
  entries: KnowledgeEntry[],
  clientName: string,
  links: KnowledgeLink[],
): Promise<void> {
  if (!isVaultConfigured()) return;

  // Build the linkedTitles map from all entries
  const linkedTitles = new Map<string, string>();
  for (const entry of entries) {
    linkedTitles.set(entry.id, entry.title);
  }

  for (const entry of entries) {
    await syncKnowledgeEntryToVault(entry, clientName, links, linkedTitles);
  }
}
