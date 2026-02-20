/**
 * GitHub API client for reading/writing Obsidian vault files.
 *
 * Required env vars:
 *   GITHUB_VAULT_TOKEN  — Personal access token with `repo` scope
 *   GITHUB_VAULT_REPO   — "owner/repo" (e.g. "Jacknelson6/nativz-vault")
 *   GITHUB_VAULT_BRANCH — Branch name (defaults to "main")
 */

const BASE = 'https://api.github.com';

function getConfig() {
  const token = process.env.GITHUB_VAULT_TOKEN;
  const repo = process.env.GITHUB_VAULT_REPO;
  const branch = (process.env.GITHUB_VAULT_BRANCH || 'main').trim();

  if (!token || !repo) {
    throw new Error('Vault not configured: set GITHUB_VAULT_TOKEN and GITHUB_VAULT_REPO');
  }

  return { token, repo, branch };
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

export function isVaultConfigured(): boolean {
  return !!(process.env.GITHUB_VAULT_TOKEN && process.env.GITHUB_VAULT_REPO);
}

/**
 * Read a file's contents from the vault.
 * Returns { content, sha } or null if not found.
 */
export async function readFile(path: string): Promise<{ content: string; sha: string } | null> {
  const { token, repo, branch } = getConfig();

  const res = await fetch(`${BASE}/repos/${repo}/contents/${encodeURIPath(path)}?ref=${branch}`, {
    headers: headers(token),
    next: { revalidate: 300 }, // Cache for 5 minutes
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { content, sha: data.sha };
}

/**
 * Write (create or update) a file in the vault.
 * If the file exists, pass its SHA to update. Otherwise creates new.
 */
export async function writeFile(
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  const { token, repo, branch } = getConfig();

  // If no SHA provided, try to get the existing file's SHA
  let existingSha = sha;
  if (!existingSha) {
    const existing = await readFile(path);
    if (existing) existingSha = existing.sha;
  }

  const body: Record<string, string> = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(`${BASE}/repos/${repo}/contents/${encodeURIPath(path)}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`GitHub write failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  return { sha: data.content.sha };
}

/**
 * List files in a directory.
 * Returns array of { name, path, type ('file' | 'dir'), sha }.
 */
export async function listFiles(
  dirPath: string,
): Promise<Array<{ name: string; path: string; type: 'file' | 'dir'; sha: string }>> {
  const { token, repo, branch } = getConfig();

  const res = await fetch(
    `${BASE}/repos/${repo}/contents/${encodeURIPath(dirPath)}?ref=${branch}`,
    { headers: headers(token), next: { revalidate: 300 } },
  );

  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub list failed (${res.status}): ${await res.text()}`);

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((item: { name: string; path: string; type: string; sha: string }) => ({
    name: item.name,
    path: item.path,
    type: item.type === 'dir' ? 'dir' : 'file',
    sha: item.sha,
  }));
}

/**
 * Delete a file from the vault.
 */
export async function deleteFile(path: string, message: string): Promise<void> {
  const { token, repo, branch } = getConfig();

  const existing = await readFile(path);
  if (!existing) return; // Already gone

  const res = await fetch(`${BASE}/repos/${repo}/contents/${encodeURIPath(path)}`, {
    method: 'DELETE',
    headers: headers(token),
    body: JSON.stringify({
      message,
      sha: existing.sha,
      branch,
    }),
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`GitHub delete failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * Check if a file exists in the vault.
 */
export async function fileExists(path: string): Promise<boolean> {
  const { token, repo, branch } = getConfig();

  const res = await fetch(`${BASE}/repos/${repo}/contents/${encodeURIPath(path)}?ref=${branch}`, {
    method: 'HEAD',
    headers: headers(token),
    next: { revalidate: 300 },
  });

  return res.ok;
}

/** Encode path segments while preserving slashes */
function encodeURIPath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
