/**
 * GitHub wrapper for the external docs repos (nativz-docs, ac-docs).
 *
 * These repos host the branded proposal + sign-and-pay pages at
 * docs.nativz.io and docs.andersoncollaborative.com. Cortex writes per-prospect
 * folders into them via the GitHub Contents API; Cloudflare Pages auto-deploys
 * the change, and the existing CF Pages Functions in those repos handle sign,
 * PDF rendering, Stripe, and emails at execution.
 *
 * Required env vars:
 *   DOCS_GITHUB_TOKEN — PAT with `repo` scope on both docs repos.
 *   DOCS_GITHUB_BRANCH — branch to commit to (defaults to "main").
 */

const BASE = 'https://api.github.com';

function getConfig(): { token: string; branch: string } {
  const token = process.env.DOCS_GITHUB_TOKEN || process.env.GITHUB_VAULT_TOKEN;
  const branch = (process.env.DOCS_GITHUB_BRANCH || 'main').trim();
  if (!token) {
    throw new Error(
      'Docs repo not configured: set DOCS_GITHUB_TOKEN (falls back to GITHUB_VAULT_TOKEN).',
    );
  }
  return { token, branch };
}

export function isDocsRepoConfigured(): boolean {
  return !!(process.env.DOCS_GITHUB_TOKEN || process.env.GITHUB_VAULT_TOKEN);
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'nativz-cortex',
  };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

type ContentsItem = {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'submodule' | 'symlink';
  sha: string;
  size: number;
  content?: string;
  encoding?: 'base64';
};

export async function readFile(
  repo: string,
  path: string,
): Promise<{ content: string; sha: string; isBinary: boolean } | null> {
  const { token, branch } = getConfig();
  const res = await fetch(
    `${BASE}/repos/${repo}/contents/${encodePath(path)}?ref=${branch}`,
    { headers: headers(token), cache: 'no-store' },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed ${repo}/${path} (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as ContentsItem;
  if (!data.content) throw new Error(`GitHub returned no content for ${repo}/${path}`);
  const raw = Buffer.from(data.content, 'base64');
  const isBinary = raw.includes(0);
  // Binary files round-trip via base64 (they're opaque bytes). Text stays UTF-8.
  const content = isBinary ? raw.toString('base64') : raw.toString('utf-8');
  return { content, sha: data.sha, isBinary };
}

export async function listDir(
  repo: string,
  path: string,
): Promise<Array<{ name: string; path: string; type: string; sha: string; size: number }>> {
  const { token, branch } = getConfig();
  const res = await fetch(
    `${BASE}/repos/${repo}/contents/${encodePath(path)}?ref=${branch}`,
    { headers: headers(token), cache: 'no-store' },
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub list failed ${repo}/${path} (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((i: ContentsItem) => ({
    name: i.name,
    path: i.path,
    type: i.type,
    sha: i.sha,
    size: i.size,
  }));
}

export async function pathExists(repo: string, path: string): Promise<boolean> {
  const { token, branch } = getConfig();
  const res = await fetch(
    `${BASE}/repos/${repo}/contents/${encodePath(path)}?ref=${branch}`,
    { method: 'HEAD', headers: headers(token), cache: 'no-store' },
  );
  return res.ok;
}

/**
 * Write (create or update) a single file.
 *   Buffer → raw bytes, we base64 them.
 *   String + isBinary:true → already base64; pass through unchanged.
 *   String (default) → UTF-8 text; we base64-encode.
 */
export async function writeFile(
  repo: string,
  path: string,
  content: string | Buffer,
  message: string,
  opts: { sha?: string; isBinary?: boolean } = {},
): Promise<{ sha: string }> {
  const { token, branch } = getConfig();
  let sha = opts.sha;
  if (!sha) {
    const existing = await readFile(repo, path).catch(() => null);
    if (existing) sha = existing.sha;
  }
  const b64 = Buffer.isBuffer(content)
    ? content.toString('base64')
    : opts.isBinary
      ? content
      : Buffer.from(content, 'utf-8').toString('base64');
  const body: Record<string, unknown> = { message, content: b64, branch };
  if (sha) body.sha = sha;
  const res = await fetch(`${BASE}/repos/${repo}/contents/${encodePath(path)}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub write failed ${repo}/${path} (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return { sha: data.content.sha as string };
}

/**
 * Recursively copy a folder inside the same repo. Small templates only — we
 * one-shot each file via Contents API, no git-tree batching. Idempotent when
 * overwrite='skip' (existing files left alone).
 */
export async function copyFolder(
  repo: string,
  srcFolder: string,
  destFolder: string,
  message: string,
  opts: { overwrite?: 'skip' | 'replace'; only?: (relPath: string) => boolean } = {},
): Promise<{ filesWritten: number }> {
  const overwrite = opts.overwrite ?? 'skip';
  let filesWritten = 0;

  async function walk(currentSrc: string) {
    const items = await listDir(repo, currentSrc);
    for (const item of items) {
      const relPath = item.path.substring(srcFolder.length + 1);
      const destPath = `${destFolder}/${relPath}`;
      if (opts.only && !opts.only(relPath)) continue;

      if (item.type === 'dir') {
        await walk(item.path);
        continue;
      }
      if (item.type !== 'file') continue;

      if (overwrite === 'skip') {
        const already = await pathExists(repo, destPath);
        if (already) continue;
      }
      const file = await readFile(repo, item.path);
      if (!file) continue;
      await writeFile(repo, destPath, file.content, message, { isBinary: file.isBinary });
      filesWritten += 1;
    }
  }

  await walk(srcFolder);
  return { filesWritten };
}

/** Build the public URL for a slug on the docs host. */
export function publicUrl(publicBaseUrl: string, folder: string): string {
  const base = publicBaseUrl.replace(/\/+$/, '');
  return `${base}/${encodeURI(folder)}/`;
}
