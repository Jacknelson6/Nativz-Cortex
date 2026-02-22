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
  formatStrategy,
  formatShootPlan,
  formatContentLog,
  researchPath,
  ideaPath,
  genericResearchPath,
  clientProfilePath,
  strategyPath,
  shootPlanPath,
  contentLogPath,
} from './formatter';
import type { TopicSearch } from '@/lib/types/search';
import type { ContentStrategy, ShootPlan } from '@/lib/types/strategy';

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

/** Sync a content strategy to the vault. */
export async function syncStrategyToVault(
  strategy: ContentStrategy,
  clientName: string,
  industry: string,
): Promise<void> {
  if (!isVaultConfigured()) return;

  try {
    const markdown = formatStrategy(strategy, clientName, industry);
    const path = strategyPath(clientName);
    await writeFile(path, markdown, `strategy: ${clientName}`);
  } catch (error) {
    console.error('Vault sync (strategy) failed:', error);
  }
}

/** Sync a shoot plan to the vault. */
export async function syncShootPlanToVault(
  plan: ShootPlan,
  clientName: string,
  shootDate: string,
  title: string,
): Promise<void> {
  if (!isVaultConfigured()) return;

  try {
    const markdown = formatShootPlan(plan, clientName, shootDate, title);
    const path = shootPlanPath(clientName, shootDate);
    await writeFile(path, markdown, `shoot plan: ${clientName} ${shootDate}`);
  } catch (error) {
    console.error('Vault sync (shoot plan) failed:', error);
  }
}

/** Sync a content log entry to the vault. */
export async function syncContentLogToVault(
  log: { title: string; content_type?: string | null; platform?: string | null; performance_notes?: string | null; published_at?: string | null },
  clientName: string,
): Promise<void> {
  if (!isVaultConfigured()) return;

  try {
    const markdown = formatContentLog(log, clientName);
    const path = contentLogPath(clientName, log.title);
    await writeFile(path, markdown, `content log: ${log.title}`);
  } catch (error) {
    console.error('Vault sync (content log) failed:', error);
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
