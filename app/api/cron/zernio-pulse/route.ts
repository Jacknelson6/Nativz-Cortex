// ZNA-03: daily AI pulse cron. Runs 30 min after sync-reporting.
// For each active, non-paused client: builds the signal report, applies
// the trigger gate, calls generatePulse(), upserts. Concurrency cap 5.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { buildSignalReport, findHighConfidencePosts } from '@/lib/analytics/zernio-pulse-signal';
import { generatePulse } from '@/lib/analytics/zernio-pulse';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CONCURRENCY = 5;

interface Counters {
  generated: number;
  gated_out: number;
  dropped: number;
  failed: number;
}

async function handleClient(
  admin: ReturnType<typeof createAdminClient>,
  client: { id: string; name: string; organization_id: string },
  asOfDate: string,
): Promise<keyof Counters | 'locked' | 'no_org' | 'no_profiles'> {
  if (!client.organization_id) return 'no_org';

  // Skip if locked today.
  const { data: existing } = await admin
    .from('client_analytics_pulses')
    .select('id, is_locked')
    .eq('client_id', client.id)
    .eq('pulse_date', asOfDate)
    .maybeSingle();
  if (existing?.is_locked) return 'locked';

  // Skip clients with no social profiles.
  const { count: profileCount } = await admin
    .from('social_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client.id)
    .eq('is_active', true);
  if (!profileCount) return 'no_profiles';

  const [report, hcPosts] = await Promise.all([
    buildSignalReport({ supabase: admin, clientId: client.id, asOfDate }),
    findHighConfidencePosts({ supabase: admin, clientId: client.id, asOfDate }),
  ]);

  const result = await generatePulse({
    supabase: admin,
    input: {
      client_id: client.id,
      client_name: client.name,
      organization_id: client.organization_id,
      pulse_date: asOfDate,
      signal_report: report,
      high_confidence_posts: hcPosts,
    },
  });

  if (result.status === 'persisted') return 'generated';
  if (result.status === 'gated_out') return 'gated_out';
  if (
    result.status === 'dropped_banned' ||
    result.status === 'dropped_schema' ||
    result.status === 'dropped_sentence_count'
  ) {
    return 'dropped';
  }
  return 'failed';
}

async function handleGet(req: NextRequest) {
  const startedAt = Date.now();
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: clients, error } = await admin
    .from('clients')
    .select('id, name, organization_id, is_active, is_paused')
    .eq('is_active', true)
    .eq('is_paused', false);

  if (error) {
    console.error('[cron/zernio-pulse] query error', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const asOfDate = new Date().toISOString().slice(0, 10);
  const counters: Counters = { generated: 0, gated_out: 0, dropped: 0, failed: 0 };
  const list = clients ?? [];

  // Concurrency cap via simple worker pool.
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const i = cursor++;
      const c = list[i];
      try {
        const outcome = await handleClient(
          admin,
          { id: c.id, name: c.name, organization_id: c.organization_id },
          asOfDate,
        );
        if (outcome === 'generated') counters.generated += 1;
        else if (outcome === 'gated_out') counters.gated_out += 1;
        else if (outcome === 'dropped') counters.dropped += 1;
        else if (outcome === 'failed') counters.failed += 1;
        // locked / no_org / no_profiles count as silent skips.
      } catch (err) {
        counters.failed += 1;
        console.error('[cron/zernio-pulse] client_error', { client_id: c.id, error: String(err) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length || 1) }, () => worker()));

  const duration_ms = Date.now() - startedAt;
  console.log('[cron/zernio-pulse] summary', { ...counters, duration_ms, asOfDate });
  return NextResponse.json({ ...counters, duration_ms });
}

export const GET = withCronTelemetry(
  { route: '/api/cron/zernio-pulse', extractRowsProcessed: (b) => (b as Counters | null)?.generated },
  handleGet,
);
