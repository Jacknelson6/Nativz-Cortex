import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Proxy for Vercel's deployment-events API so the client-side log stream
 * doesn't need the Vercel token exposed. Admin-only — we scope by role
 * before every hit because logs can contain request payloads.
 *
 * Vercel docs: `GET /v3/deployments/{id}/events` returns build + runtime
 * events. We pass through `since`, `direction`, `limit`, `builds`, and
 * `follow` so the client can poll forward or fetch backward in one shape.
 */

const QuerySchema = z.object({
  deploymentId: z.string().min(1),
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

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid query', details: parsed.error.flatten() }, { status: 400 });
  }
  const { deploymentId, since, direction, limit, builds } = parsed.data;

  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_ORG_ID?.trim() || process.env.VERCEL_TEAM_ID?.trim();
  if (!token) {
    return NextResponse.json({ error: 'VERCEL_TOKEN not configured' }, { status: 503 });
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
