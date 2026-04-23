import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAndSendTrendReport } from '@/lib/reporting/generate-trend-report';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import type { TrendReportCadence } from '@/lib/reporting/trend-report-types';

export const maxDuration = 300;

async function handleGet(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: due, error } = await admin
    .from('trend_report_subscriptions')
    .select(
      'id, client_id, organization_id, name, topic_query, keywords, brand_names, platforms, cadence, recipients, include_portal_users, enabled, last_run_at, next_run_at',
    )
    .eq('enabled', true)
    .lte('next_run_at', now.toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ subscriptionId: string; ok: boolean; error?: string; skipped?: string }> = [];

  for (const sub of due ?? []) {
    try {
      const result = await generateAndSendTrendReport({
        id: sub.id as string,
        client_id: (sub.client_id as string | null) ?? null,
        organization_id: (sub.organization_id as string | null) ?? null,
        name: sub.name as string,
        topic_query: sub.topic_query as string,
        keywords: (sub.keywords as string[]) ?? [],
        brand_names: (sub.brand_names as string[]) ?? [],
        platforms: (sub.platforms as string[]) ?? [],
        cadence: sub.cadence as TrendReportCadence,
        recipients: (sub.recipients as string[]) ?? [],
        include_portal_users: sub.include_portal_users as boolean,
        enabled: sub.enabled as boolean,
        last_run_at: sub.last_run_at as string | null,
        next_run_at: sub.next_run_at as string,
      });
      results.push({
        subscriptionId: sub.id as string,
        ok: result.ok,
        error: result.error,
        skipped: result.skippedReason,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      results.push({ subscriptionId: sub.id as string, ok: false, error: message });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    success: true,
    processed: results.length,
    ok,
    failed,
    results,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/trend-reports',
    extractRowsProcessed: (body) => {
      const count = (body as { processed?: number } | null)?.processed;
      return typeof count === 'number' ? count : undefined;
    },
  },
  handleGet,
);
