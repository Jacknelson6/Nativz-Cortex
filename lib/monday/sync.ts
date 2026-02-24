/**
 * Sync Monday.com clients to the Obsidian vault.
 *
 * Monday.com owns: name, abbreviation, services, POC, agency
 * Vault owns: target_audience, brand_voice, topic_keywords, website, industry
 *
 * When syncing, Monday.com fields are updated but vault-owned fields are preserved.
 */

import { readFile, writeFile } from '@/lib/vault/github';
import { parseFrontmatter } from '@/lib/vault/parser';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchMondayClients, parseMondayClient, type MondayItem } from './client';

export interface ParsedMondayClient {
  mondayId: string;
  name: string;
  abbreviation: string;
  agency: string;
  services: string[];
  contacts: Array<{ name: string; email: string }>;
  spaceId: string;
}

/**
 * Build the updated _profile.md content, preserving vault-owned fields.
 */
function buildProfileMarkdown(
  monday: ParsedMondayClient,
  existingContent: string | null,
): string {
  // Parse existing vault content to preserve vault-owned fields
  const vaultFields = {
    industry: '',
    website: '',
    targetAudience: '',
    brandVoice: '',
    topicKeywords: [] as string[],
  };

  if (existingContent) {
    const { frontmatter, body } = parseFrontmatter(existingContent);
    vaultFields.industry = (frontmatter.industry as string) || '';
    vaultFields.website = (frontmatter.website as string) || '';

    // Extract sections from body
    const extractSection = (heading: string): string => {
      const regex = new RegExp(`## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
      const match = body.match(regex);
      return match ? match[1].trim() : '';
    };

    const extractList = (heading: string): string[] => {
      const section = extractSection(heading);
      if (!section) return [];
      return section
        .split('\n')
        .filter((l) => l.startsWith('- '))
        .map((l) => l.replace(/^-\s*/, '').trim());
    };

    vaultFields.targetAudience = extractSection('Target audience');
    vaultFields.brandVoice = extractSection('Brand voice');
    vaultFields.topicKeywords = extractList('Topic keywords');
  }

  // Build frontmatter — Monday.com fields + vault-owned fields
  const fmLines = [
    '---',
    `type: "client-profile"`,
    `client: ${JSON.stringify(monday.name)}`,
  ];
  if (monday.abbreviation) fmLines.push(`abbreviation: ${JSON.stringify(monday.abbreviation)}`);
  if (vaultFields.industry) fmLines.push(`industry: ${JSON.stringify(vaultFields.industry)}`);
  if (monday.agency) fmLines.push(`agency: ${JSON.stringify(monday.agency)}`);
  if (vaultFields.website) fmLines.push(`website: ${JSON.stringify(vaultFields.website)}`);
  if (monday.services.length > 0) {
    fmLines.push('services:');
    for (const s of monday.services) {
      fmLines.push(`  - ${JSON.stringify(s)}`);
    }
  }
  if (monday.mondayId) fmLines.push(`monday_id: ${JSON.stringify(monday.mondayId)}`);
  fmLines.push(`updated: "${new Date().toISOString().split('T')[0]}"`);
  fmLines.push(`monday_synced: true`);
  fmLines.push('---');

  // Build body
  const sections: string[] = [
    fmLines.join('\n'),
    '',
    `# ${monday.name}`,
    '',
  ];

  // Quote line
  const parts = [monday.abbreviation, monday.agency].filter(Boolean);
  if (parts.length) sections.push(`> ${parts.join(' | ')}`, '');

  // Website (vault-owned)
  if (vaultFields.website) {
    sections.push(`**Website:** ${vaultFields.website}`, '');
  }

  // Services (Monday.com-owned)
  if (monday.services.length > 0) {
    sections.push('## Services', monday.services.map((s) => `- ${s}`).join('\n'), '');
  }

  // Point of contact (Monday.com-owned)
  if (monday.contacts.length > 0) {
    sections.push(
      '## Point of contact',
      monday.contacts.map((c) => `- ${c.name} <${c.email}>`).join('\n'),
      '',
    );
  }

  // Target audience (vault-owned — preserved)
  sections.push('## Target audience', '');
  if (vaultFields.targetAudience) sections.push(vaultFields.targetAudience, '');

  // Brand voice (vault-owned — preserved)
  sections.push('## Brand voice', '');
  if (vaultFields.brandVoice) sections.push(vaultFields.brandVoice, '');

  // Topic keywords (vault-owned — preserved)
  sections.push('## Topic keywords', '');
  if (vaultFields.topicKeywords.length > 0) {
    sections.push(vaultFields.topicKeywords.map((k) => `- ${k}`).join('\n'), '');
  }

  return sections.join('\n');
}

/**
 * Sync a single Monday.com client item to the vault.
 * Also updates is_active in the DB — clients with no services are deactivated.
 */
export async function syncMondayClientToVault(
  item: MondayItem,
): Promise<{ name: string; action: 'created' | 'updated' }> {
  const parsed = parseMondayClient(item);
  const path = `Clients/${parsed.name}/_profile.md`;

  // Read existing file to preserve vault-owned fields
  const existing = await readFile(path);
  const content = buildProfileMarkdown(parsed, existing?.content || null);

  await writeFile(path, content, `monday-sync: ${parsed.name}`, existing?.sha);

  // Auto-deactivate clients with no services, reactivate those with services
  const adminClient = createAdminClient();
  await adminClient
    .from('clients')
    .update({ is_active: parsed.services.length > 0 })
    .ilike('name', parsed.name);

  return {
    name: parsed.name,
    action: existing ? 'updated' : 'created',
  };
}

/**
 * Full sync: fetch all clients from Monday.com and sync to vault.
 * Clients with zero services are automatically deactivated in the DB.
 */
export async function syncAllMondayClients(): Promise<{
  results: Array<{ name: string; action: string }>;
}> {
  const items = await fetchMondayClients();
  const results = [];
  const adminClient = createAdminClient();

  for (const item of items) {
    // Skip "Test Client" type items
    if (item.name.toLowerCase().includes('test client')) continue;

    try {
      const parsed = parseMondayClient(item);
      const result = await syncMondayClientToVault(item);

      // Auto-deactivate clients with no services, reactivate those with services
      await adminClient
        .from('clients')
        .update({ is_active: parsed.services.length > 0 })
        .ilike('name', parsed.name);

      results.push(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      results.push({ name: item.name, action: `error: ${msg}` });
    }
  }

  return { results };
}
