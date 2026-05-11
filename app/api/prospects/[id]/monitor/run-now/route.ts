// SPY-06 T16: ad-hoc run trigger. Synchronous v1 (Workflow DevKit not yet
// installed). Rate limit 1/12h per prospect.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runMonitor } from '@/lib/prospects/monitor-orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const RATE_LIMIT_MS = 12 * 60 * 60 * 1000;

async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data } = await admin.from('users').select('role').eq('id', user.id).single();
  if (!data || !['admin', 'super_admin'].includes(data.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { ok: true };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const admin = createAdminClient();

    const { data: config } = await admin
      .from('prospect_monitor_config')
      .select('*')
      .eq('prospect_id', id)
      .maybeSingle();

    if (!config) {
      return NextResponse.json(
        { error: 'No monitor config. Save monitor settings first.' },
        { status: 409 },
      );
    }

    if (config.last_run_at) {
      const sinceMs = Date.now() - new Date(config.last_run_at).getTime();
      if (sinceMs < RATE_LIMIT_MS) {
        return NextResponse.json(
          {
            error: 'Rate limited',
            retry_after_seconds: Math.ceil((RATE_LIMIT_MS - sinceMs) / 1000),
          },
          { status: 429 },
        );
      }
    }

    const runId = crypto.randomUUID();
    const result = await runMonitor({
      prospectId: id,
      configId: config.id,
      workflowRunId: runId,
    });

    return NextResponse.json({ workflow_run_id: runId, ...result });
  } catch (err) {
    console.error('POST /api/prospects/[id]/monitor/run-now error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
