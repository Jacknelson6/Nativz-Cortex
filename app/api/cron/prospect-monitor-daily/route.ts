// SPY-06 T19: daily cron — scans configs whose day_of_week matches today
// and triggers a monitor run for each. Biweekly configs additionally
// require ≥13 days since last_run_at.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runMonitor } from '@/lib/prospects/monitor-orchestrator';

export const maxDuration = 300;

const BIWEEKLY_MIN_DAYS = 13;

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const dow = new Date().getUTCDay(); // 0=Sun

  const { data: configs, error } = await admin
    .from('prospect_monitor_config')
    .select('*')
    .eq('active', true)
    .eq('day_of_week', dow);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let triggered = 0;
  let skipped = 0;
  const errors: Array<{ prospect_id: string; message: string }> = [];

  for (const cfg of configs ?? []) {
    if (cfg.frequency === 'biweekly' && cfg.last_run_at) {
      const ageMs = Date.now() - new Date(cfg.last_run_at).getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      if (ageDays < BIWEEKLY_MIN_DAYS) {
        skipped += 1;
        continue;
      }
    }
    try {
      // Run sequentially. Each run is short enough (~30s) that doing 50 in
      // a single 300s cron is fine for v1. When fleet grows past that we
      // swap in Workflow DevKit fan-out.
      await runMonitor({ prospectId: cfg.prospect_id, configId: cfg.id });
      triggered += 1;
    } catch (err) {
      errors.push({
        prospect_id: cfg.prospect_id,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({ triggered, skipped, errors });
}

export async function GET(request: NextRequest) {
  try {
    return await handleGet(request);
  } catch (err) {
    console.error('GET /api/cron/prospect-monitor-daily error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
