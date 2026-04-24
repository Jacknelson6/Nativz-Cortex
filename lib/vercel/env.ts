/**
 * Vercel environment-variable helpers.
 *
 * Wraps the Vercel REST API so Cortex can keep its own copy of a secret
 * (stored in `agency_settings.llm_provider_keys`) in sync with the same key
 * on the Vercel project env. Two-way: we can read the decrypted value out of
 * Vercel, or we can push a new value up.
 *
 * Auth uses `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (+ optional `VERCEL_ORG_ID` /
 * `VERCEL_TEAM_ID`). Everything is optional — callers get `null` or a
 * graceful error rather than an exception if the token isn't wired.
 */

export type VercelEnvTarget = 'production' | 'preview' | 'development';

const DEFAULT_TARGETS: VercelEnvTarget[] = ['production', 'preview', 'development'];

interface VercelEnvVar {
  id: string;
  key: string;
  value: string;
  target: VercelEnvTarget[];
  type: string;
  updatedAt?: number;
  createdAt?: number;
}

interface VercelContext {
  token: string;
  projectId: string;
  teamId: string | null;
}

function readContext(): VercelContext | null {
  const token = process.env.VERCEL_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  const teamId =
    process.env.VERCEL_ORG_ID?.trim() || process.env.VERCEL_TEAM_ID?.trim() || null;
  if (!token || !projectId) return null;
  return { token, projectId, teamId };
}

function withTeam(url: string, ctx: VercelContext): string {
  const u = new URL(url);
  if (ctx.teamId) u.searchParams.set('teamId', ctx.teamId);
  return u.toString();
}

/**
 * Fetch the decrypted value of a single env var by key. Returns `null` if the
 * token is missing, the var doesn't exist, or the API errors. Never throws.
 */
export async function getVercelEnvVar(key: string): Promise<VercelEnvVar | null> {
  const ctx = readContext();
  if (!ctx) return null;

  try {
    const url = withTeam(
      `https://api.vercel.com/v9/projects/${ctx.projectId}/env?decrypt=true`,
      ctx,
    );
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ctx.token}` },
      signal: AbortSignal.timeout(6000),
      // Never cache — we want live state.
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { envs?: VercelEnvVar[] };
    const match = (data.envs ?? []).find((e) => e.key === key);
    return match ?? null;
  } catch {
    return null;
  }
}

/**
 * Upsert an env var: PATCH it if it already exists, otherwise POST to create.
 * Targets default to production + preview + development.
 *
 * Return shape:
 *   `{ ok: true, action: 'created' | 'updated' }` on success
 *   `{ ok: false, error }`                          on failure
 */
export async function upsertVercelEnvVar(
  key: string,
  value: string,
  targets: VercelEnvTarget[] = DEFAULT_TARGETS,
): Promise<
  | { ok: true; action: 'created' | 'updated'; envId: string }
  | { ok: false; error: string }
> {
  const ctx = readContext();
  if (!ctx) {
    return { ok: false, error: 'VERCEL_TOKEN or VERCEL_PROJECT_ID not configured' };
  }

  try {
    const existing = await getVercelEnvVar(key);

    if (existing) {
      const url = withTeam(
        `https://api.vercel.com/v9/projects/${ctx.projectId}/env/${existing.id}`,
        ctx,
      );
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ctx.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value, target: targets }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: `Vercel PATCH ${res.status}: ${body.slice(0, 200)}` };
      }
      return { ok: true, action: 'updated', envId: existing.id };
    }

    const createUrl = withTeam(
      `https://api.vercel.com/v10/projects/${ctx.projectId}/env?upsert=true`,
      ctx,
    );
    const res = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key, value, target: targets, type: 'encrypted' }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Vercel POST ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { created?: { id?: string } };
    return { ok: true, action: 'created', envId: data.created?.id ?? 'unknown' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

/**
 * Convenience: true iff the server has enough Vercel credentials to read /
 * write env vars. Useful for UIs that want to hide "sync with Vercel" controls
 * when the integration isn't wired.
 */
export function vercelEnvSyncAvailable(): boolean {
  return readContext() !== null;
}
