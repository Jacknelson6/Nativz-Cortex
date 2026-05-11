// ZNA-03: admin POST — synchronous regenerate. Reuses generatePulse() with
// isRegenerate=true so it bypasses the gate (regenerate is admin-driven).
// Returns 422 when gate fails OR when LLM output fails validation twice.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/require-admin';
import { buildSignalReport, findHighConfidencePosts } from '@/lib/analytics/zernio-pulse-signal';
import { generatePulse } from '@/lib/analytics/zernio-pulse';

const RegenerateSchema = z.object({ client_id: z.string().uuid() });

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = RegenerateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { client_id } = parsed.data;

  const { data: client, error: clientErr } = await auth.admin
    .from('clients')
    .select('id, name, organization_id')
    .eq('id', client_id)
    .maybeSingle();
  if (clientErr || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const asOfDate = new Date().toISOString().slice(0, 10);
  const [report, hcPosts] = await Promise.all([
    buildSignalReport({ supabase: auth.admin, clientId: client.id, asOfDate }),
    findHighConfidencePosts({ supabase: auth.admin, clientId: client.id, asOfDate }),
  ]);

  // Honour the gate for admin regenerate too: if no signal, return 422.
  if (report.triggered_gates.length === 0) {
    return NextResponse.json({ error: 'no_signal' }, { status: 422 });
  }

  const result = await generatePulse({
    supabase: auth.admin,
    input: {
      client_id: client.id,
      client_name: client.name,
      organization_id: client.organization_id,
      pulse_date: asOfDate,
      signal_report: report,
      high_confidence_posts: hcPosts,
    },
    isRegenerate: true,
  });

  if (result.status === 'persisted') {
    const { data } = await auth.admin
      .from('client_analytics_pulses')
      .select(
        'id, client_id, pulse_date, generated_at, body, signal_metric, signal_value, platforms_referenced, referenced_post_ids, is_dismissed, is_locked, flagged_wrong_at',
      )
      .eq('id', result.pulse_id!)
      .single();
    return NextResponse.json({ pulse: data });
  }

  if (result.status === 'dropped_banned' || result.status === 'dropped_sentence_count' || result.status === 'dropped_schema') {
    return NextResponse.json({ error: 'banned_topic' }, { status: 422 });
  }
  if (result.status === 'gated_out') {
    return NextResponse.json({ error: 'no_signal' }, { status: 422 });
  }
  return NextResponse.json({ error: 'llm_error' }, { status: 502 });
}
