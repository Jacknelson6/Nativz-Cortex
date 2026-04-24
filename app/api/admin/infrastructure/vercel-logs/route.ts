import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminRoute } from '@/lib/admin/require-admin';

/**
 * Proxy for Vercel's deployment-events API so the client-side log stream
 * doesn't need the Vercel token exposed. Admin-only — we scope by role
 * before every hit because logs can contain request payloads.
 *
 * Vercel docs: `GET /v3/deployments/{id}/events` returns build + runtime
 * events. We pass through `since`, `direction`, `limit`, and `builds` so
 * the client can poll forward or fetch backward in one shape.
 *
 * Security posture:
 *   1. Role-gated (requireAdminRoute).
 *   2. Deployment ID is format-validated (must start with `dpl_`) and
 *      verified to belong to VERCEL_PROJECT_ID before we proxy. Without
 *      this, a leaked admin session could pull logs for any deployment
 *      in the Vercel team.
 *   3. Simple in-process rate limit (60 req/min per admin user) so a
 *      runaway poll loop can't burn Vercel's API quota.
 */

const QuerySchema = z.object({
  deploymentId: z
    .string()
    .min(1)
    .regex(/^dpl_[A-Za-z0-9]+$/, 'deploymentId must start with dpl_ and be alphanumeric'),
  since: z.coerce.number().int().nonnegative().optional(),
  direction: z.enum(['forward', 'backward']).default('backward'),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  builds: z.coerce.number().int().min(0).max(1).default(1),
});

export interface VercelLogEvent {
  id: string;
  created: number;
  type: string;
  text: string;
  source: 'build' | 'runtime' | string;
  deploymentId: string;
  statusCode?: number;
  path?: string;
}

// Per-user in-process rate limiter — token-bucket by-the-minute. Cortex
// runs as a single Vercel function instance (Fluid Compute), so a Map is
// sufficient. If we ever scale to multiple instances per region this
// would need a shared store, but the limit here is a courtesy cap on our
// own admins, not a security boundary.
const RATE_LIMIT_MAX = 60; // requests per window
const RATE_WINDOW_MS = 60_000;
const rateState = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateState.get(userId);
  if (!entry || entry.resetAt <= now) {
    rateState.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true };
}

// Belt-and-braces check that the requested deployment actually belongs to
// our project. One round-trip to Vercel's deployment-detail endpoint;
// cached in-process for 10 minutes per deployment ID so the verification
// doesn't dominate latency on the polling loop.
const deploymentProjectCache = new Map<string, { ok: boolean; expires: number }>();
const DEPLOYMENT_CACHE_MS = 10 * 60 * 1000;

async function verifyDeploymentBelongsToProject(
  deploymentId: string,
  token: string,
  teamId: string | null,
  expectedProjectId: string,
): Promise<boolean> {
  const now = Date.now();
  const cached = deploymentProjectCache.get(deploymentId);
  if (cached && cached.expires > now) return cached.ok;

  try {
    const params = new URLSearchParams();
    if (teamId) params.set('teamId', teamId);
    const res = await fetch(
      `https://api.vercel.com/v13/deployments/${deploymentId}?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) {
      deploymentProjectCache.set(deploymentId, { ok: false, expires: now + DEPLOYMENT_CACHE_MS });
      return false;
    }
    const body = (await res.json()) as { projectId?: string };
    const matches = body.projectId === expectedProjectId;
    deploymentProjectCache.set(deploymentId, { ok: matches, expires: now + DEPLOYMENT_CACHE_MS });
    return matches;
  } catch {
    // On verify-fetch failure, fail closed — better to reject a legit
    // deployment than to expose unrelated logs on a transient error.
    return false;
  }
}

export async function GET(req: Request) {
  const gate = await requireAdminRoute();
  if (gate instanceof NextResponse) return gate;

  const rate = checkRateLimit(gate.user.id);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'rate limited — slow down the poll interval' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter ?? 60) } },
    );
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid query', details: parsed.error.flatten() }, { status: 400 });
  }
  const { deploymentId, since, direction, limit, builds } = parsed.data;

  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_ORG_ID?.trim() || process.env.VERCEL_TEAM_ID?.trim() || null;
  const projectId = process.env.VERCEL_PROJECT_ID?.trim() || null;
  if (!token) {
    return NextResponse.json({ error: 'VERCEL_TOKEN not configured' }, { status: 503 });
  }

  // Only allow deployments tied to our project (when we know our project).
  // If VERCEL_PROJECT_ID isn't set we fall back to relying on the team-
  // scoped token — still bounded, just less specific.
  if (projectId) {
    const belongs = await verifyDeploymentBelongsToProject(deploymentId, token, teamId, projectId);
    if (!belongs) {
      return NextResponse.json(
        { error: 'deployment does not belong to this project' },
        { status: 404 },
      );
    }
  }

  const params = new URLSearchParams();
  if (teamId) params.set('teamId', teamId);
  params.set('direction', direction);
  params.set('limit', String(limit));
  if (since !== undefined) params.set('since', String(since));
  params.set('builds', String(builds));

  try {
    const res = await fetch(
      `https://api.vercel.com/v3/deployments/${deploymentId}/events?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `Vercel API ${res.status}`, details: await res.text().catch(() => null) },
        { status: 502 },
      );
    }
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    const events: VercelLogEvent[] = raw
      .map((e) => normalizeEvent(e, deploymentId))
      .filter((e): e is VercelLogEvent => !!e);
    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'fetch failed' },
      { status: 502 },
    );
  }
}

/**
 * Vercel returns two slightly different event shapes depending on API
 * version; normalize to one flat record the client can render without
 * reaching into nested `payload` objects.
 */
function normalizeEvent(raw: Record<string, unknown>, deploymentId: string): VercelLogEvent | null {
  const payload = (raw.payload as Record<string, unknown> | undefined) ?? raw;
  const created = Number(raw.created ?? payload.date ?? payload.created ?? 0);
  const text = String(payload.text ?? '').trim();
  if (!text) return null;
  const id = String(payload.id ?? payload.serial ?? `${deploymentId}-${created}`);
  const info = payload.info as { type?: string } | undefined;
  const source: VercelLogEvent['source'] = info?.type === 'build' ? 'build' : 'runtime';
  const statusCode = typeof payload.statusCode === 'number' ? payload.statusCode : undefined;
  const path = typeof payload.path === 'string' ? payload.path : undefined;
  return {
    id,
    created,
    type: String(raw.type ?? 'stdout'),
    text,
    source,
    deploymentId,
    statusCode,
    path,
  };
}
