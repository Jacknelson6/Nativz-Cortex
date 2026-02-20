/**
 * High-level vault reader functions.
 * These read from the GitHub vault and parse markdown into structured data
 * for use in server components. Uses Next.js fetch caching.
 */

import { isVaultConfigured, listFiles, readFile } from '@/lib/vault/github';
import { parseClientProfile, type ParsedClientProfile } from '@/lib/vault/parser';

// ---------------------------------------------------------------------------
// Client profiles
// ---------------------------------------------------------------------------

/**
 * Get all client profiles from the vault.
 * Returns parsed profile data for each client directory.
 */
export async function getVaultClients(): Promise<ParsedClientProfile[]> {
  if (!isVaultConfigured()) return [];

  try {
    const dirs = await listFiles('Clients');
    const clientDirs = dirs.filter((d) => d.type === 'dir');

    const profiles: ParsedClientProfile[] = [];

    // Read profiles in parallel (batched to avoid rate limits)
    const batchSize = 10;
    for (let i = 0; i < clientDirs.length; i += batchSize) {
      const batch = clientDirs.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (dir) => {
          const file = await readFile(`Clients/${dir.name}/_profile.md`);
          if (!file) return null;
          return parseClientProfile(file.content);
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          profiles.push(result.value);
        }
      }
    }

    return profiles.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('getVaultClients error:', error);
    return [];
  }
}

/**
 * Get a single client profile from the vault by name (directory name).
 */
export async function getVaultClient(clientName: string): Promise<ParsedClientProfile | null> {
  if (!isVaultConfigured()) return null;

  try {
    const file = await readFile(`Clients/${clientName}/_profile.md`);
    if (!file) return null;
    return parseClientProfile(file.content);
  } catch (error) {
    console.error(`getVaultClient(${clientName}) error:`, error);
    return null;
  }
}

/**
 * Get a single client profile by slug (searches all client directories).
 */
export async function getVaultClientBySlug(slug: string): Promise<ParsedClientProfile | null> {
  if (!isVaultConfigured()) return null;

  try {
    const clients = await getVaultClients();
    return clients.find((c) => c.slug === slug) || null;
  } catch (error) {
    console.error(`getVaultClientBySlug(${slug}) error:`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Raw file reading
// ---------------------------------------------------------------------------

/**
 * Read a raw vault file and return its content.
 */
export async function getVaultFile(path: string): Promise<string | null> {
  if (!isVaultConfigured()) return null;

  try {
    const file = await readFile(path);
    return file?.content || null;
  } catch {
    return null;
  }
}

/**
 * List files in a vault directory.
 */
export async function getVaultDirectory(dirPath: string) {
  if (!isVaultConfigured()) return [];

  try {
    return await listFiles(dirPath);
  } catch {
    return [];
  }
}
