import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { fetchPublishHealthSnapshot } from '@/lib/ops/publish-health';
import { sendPublishHealthDigest } from '@/lib/email/resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/publish-health-digest
 *
 * Morning digest summarizing yesterday's publish pipeline (PUB-05). Runs
 * at 12:00 UTC daily (7am ET). One email to Jack with per-platform
 * counts, top failing clients, canary status, and a link to the
 * /admin/ops/publish-health dashboard.
 *
 * Idempotency: same-day re-runs are a no-op via `cron_runs` row keyed on
 * (route, day). If Vercel ever re-fires the same tick, the second run
 * notices the row already exists and returns `skipped`.
 */

function todayChicago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function describeStatus(opts: {
  failedLegCount: number;
  canaryFailures: number;
}): 'all clean' | 'misses' | 'pipeline degraded' {
  if (opts.canaryFailures > 0) return 'pipeline degraded';
  if (opts.failedLegCount > 0) return 'misses';
  return 'all clean';
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const date = todayChicago();
  const recipient = process.env.PUBLISH_HEALTH_DIGEST_TO?.trim() || 'jack@nativz.io';

  // Idempotency: if cron_runs shows a successful run of this route earlier
  // today (Chicago day), skip. Vercel cron occasionally double-fires; the
  // dashboard data is cheap to compute but we don't want two emails.
  const startOfTodayChicagoMs = (() => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    // Build the "start of day in CT" ISO; offsets vary CST/CDT so we approximate
    // by subtracting today's elapsed Chicago minutes from now.
    const elapsedMin = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
    return Date.now() - elapsedMin * 60 * 1000;
  })();
  const startOfTodayIso = new Date(startOfTodayChicagoMs).toISOString();
  const { data: priorRun } = await admin
    .from('cron_runs')
    .select('id')
    .eq('route', '/api/cron/publish-health-digest')
    .eq('status', 'ok')
    .gte('started_at', startOfTodayIso)
    .limit(1)
    .maybeSingle();
  if (priorRun) {
    return NextResponse.json({ skipped: 'already-sent-today', date });
  }

  const snapshot = await fetchPublishHealthSnapshot(admin);

  // The widget gives us 7d + 24h data; the digest collapses to 24h
  // per-platform + 7d top-failing clients. Sum the last day of `daily30d`.
  const lastDay = snapshot.daily30d[snapshot.daily30d.length - 1];
  const perPlatform = (
    ['facebook', 'instagram', 'tiktok', 'youtube'] as const
  ).map((platform) => ({
    platform,
    published: lastDay?.[platform]?.published ?? 0,
    failed: lastDay?.[platform]?.failed ?? 0,
  }));
  const failedLegCount = perPlatform.reduce((sum, p) => sum + p.failed, 0);

  const canaryFailures = snapshot.canaryTrend
    .filter((t) => t.runs[0]?.publishStatus === 'failed')
    .map((t) => t.platform);
  const status = describeStatus({
    failedLegCount,
    canaryFailures: canaryFailures.length,
  });

  const dashboardUrl = 'https://cortex.nativz.io/admin/ops/publish-health';

  const result = await sendPublishHealthDigest({
    to: recipient,
    date,
    digest: {
      status,
      perPlatform,
      failedLegCount,
      topFailingClients: snapshot.topFailingClients.slice(0, 3).map((c) => ({
        clientName: c.clientName,
        failureCount: c.failureCount,
      })),
      canaryFailures,
      dashboardUrl,
    },
  });

  return NextResponse.json({
    sent: true,
    date,
    status,
    failedLegCount,
    canaryFailures: canaryFailures.length,
    emailId: result?.id ?? null,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/publish-health-digest',
    extractRowsProcessed: () => 1,
    extractMetadata: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const b = body as {
        date?: string;
        status?: string;
        failedLegCount?: number;
        canaryFailures?: number;
        skipped?: string;
      };
      return {
        date: b.date,
        status: b.status,
        failedLegCount: b.failedLegCount,
        canaryFailures: b.canaryFailures,
        skipped: b.skipped,
      };
    },
  },
  handleGet,
);
