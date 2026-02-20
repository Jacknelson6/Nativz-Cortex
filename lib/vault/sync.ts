/**
 * Auto-sync functions that push Cortex data to the Obsidian vault.
 * All functions are non-blocking — vault failures never break core flows.
 */

import { isVaultConfigured, writeFile } from './github';
import {
  formatResearchReport,
  formatIdeaNote,
  formatClientProfile,
  formatDashboard,
  researchPath,
  ideaPath,
  genericResearchPath,
  clientProfilePath,
} from './formatter';
import type { TopicSearch } from '@/lib/types/search';

/** Sync a completed search to the vault as a research note. */
export async function syncSearchToVault(
  search: TopicSearch,
  clientName?: string,
): Promise<void> {
  if (!isVaultConfigured()) return;

  try {
    const markdown = formatResearchReport(search, clientName);
    const path = clientName
      ? researchPath(clientName, search.query, search.created_at)
      : genericResearchPath(search.query, search.created_at);

    await writeFile(path, markdown, `research: ${search.query}`);
  } catch (error) {
    console.error('Vault sync (search) failed:', error);
  }
}

/** Sync an idea submission to the vault. */
export async function syncIdeaToVault(
  idea: { id: string; title: string; description?: string | null; category: string; source_url?: string | null; status: string; created_at: string },
  clientName?: string,
): Promise<void> {
  if (!isVaultConfigured()) return;

  try {
    const markdown = formatIdeaNote(idea, clientName);
    const path = clientName
      ? ideaPath(clientName, idea.title)
      : `Ideas/${idea.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;

    await writeFile(path, markdown, `idea: ${idea.title}`);
  } catch (error) {
    console.error('Vault sync (idea) failed:', error);
  }
}

/** Sync client profile to the vault. */
export async function syncClientProfileToVault(
  client: {
    name: string;
    industry: string;
    website_url?: string | null;
    target_audience?: string | null;
    brand_voice?: string | null;
    topic_keywords?: string[];
    logo_url?: string | null;
    preferences?: {
      tone_keywords?: string[];
      topics_lean_into?: string[];
      topics_avoid?: string[];
      competitor_accounts?: string[];
      seasonal_priorities?: string[];
    } | null;
  },
): Promise<void> {
  if (!isVaultConfigured()) return;

  try {
    const markdown = formatClientProfile(client);
    const path = clientProfilePath(client.name);

    await writeFile(path, markdown, `profile: ${client.name}`);
  } catch (error) {
    console.error('Vault sync (client profile) failed:', error);
  }
}

/** Sync the dashboard MOC listing all clients. */
export async function syncDashboardToVault(
  clients: Array<{ name: string; slug: string }>,
): Promise<void> {
  if (!isVaultConfigured()) return;

  try {
    const markdown = formatDashboard(clients);
    await writeFile('Dashboard.md', markdown, 'update dashboard');
  } catch (error) {
    console.error('Vault sync (dashboard) failed:', error);
  }
}
