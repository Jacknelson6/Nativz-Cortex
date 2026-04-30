import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import {
  probeDrive,
  probeGemini,
  probeMonday,
  probeOpenRouter,
  probeResend,
  probeSupabase,
  probeZernioPresence,
  type ProbeResult,
} from '@/lib/admin/content-tools/probes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content-tools/connections
 *
 * Powers the Connections tab on /admin/content-tools. Returns one row
 * per integration the content pipeline depends on.
 *
 * Iter 14.2: live reachability probes (Resend /domains, Monday me{},
 * Supabase round-trip, OpenRouter /credits, Gemini models.list). Drive
 * + Zernio stay presence-only because Drive needs a JWT exchange that
 * lands with the Quick Schedule pipeline (iter 14.4) and Zernio has no
 * public health endpoint to probe without paging the team channel.
 *
 * All HTTP probes share a 5s budget via AbortController and run in
 * parallel via Promise.all, so the slowest probe sets the route's wall
 * time. Failures don't bubble up: a probe that times out or 500s lands
 * in the `unknown` bucket and the row renders with the failure detail
 * instead of blocking the rest of the dashboard.
 */

interface ConnectionRow {
  id: string;
  label: string;
  description: string;
  status: ProbeResult['status'];
  lastCheckedAt: string;
  detail: string | null;
  latencyMs: number | null;
}

interface ProbeSpec {
  id: string;
  label: string;
  description: string;
  run: () => Promise<ProbeResult> | ProbeResult;
}

const PROBES: ProbeSpec[] = [
  {
    id: 'supabase',
    label: 'Supabase',
    description: 'Postgres, auth, RLS, storage. The agency database.',
    run: probeSupabase,
  },
  {
    id: 'resend',
    label: 'Resend',
    description: 'Outbound transactional email (calendar shares, followups).',
    run: probeResend,
  },
  {
    id: 'monday',
    label: 'Monday',
    description: 'Source of truth for editor approvals + content calendar items.',
    run: probeMonday,
  },
  {
    id: 'zernio',
    label: 'Zernio',
    description: 'Social posting webhook + scheduled-post lifecycle notifications.',
    run: probeZernioPresence,
  },
  {
    id: 'google-drive',
    label: 'Google Drive',
    description: 'Editor folder ingestion (raw masters + thumbnails).',
    run: probeDrive,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Claude Sonnet 4.5 routing for caption + topic AI calls.',
    run: probeOpenRouter,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Video analysis + thumbnail extraction + transcript pipeline.',
    run: probeGemini,
  },
];

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  // Run every probe in parallel. allSettled so one bad probe can't
  // tank the whole dashboard.
  const settled = await Promise.allSettled(
    PROBES.map(async (p) => ({ id: p.id, result: await p.run() })),
  );

  const checkedAt = new Date().toISOString();
  const rows: ConnectionRow[] = PROBES.map((spec, i) => {
    const s = settled[i];
    const probe: ProbeResult =
      s.status === 'fulfilled'
        ? s.value.result
        : {
            status: 'unknown',
            detail: s.reason instanceof Error ? s.reason.message : 'probe threw',
            latencyMs: null,
          };
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      status: probe.status,
      detail: probe.detail,
      latencyMs: probe.latencyMs,
      lastCheckedAt: checkedAt,
    };
  });

  return NextResponse.json({ rows });
}
