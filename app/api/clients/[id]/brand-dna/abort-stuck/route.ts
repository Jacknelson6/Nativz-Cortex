import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  BRAND_DNA_JOB_STALE_MS,
  isBrandDnaJobInFlightStatus,
} from '@/lib/brand-dna/constants';

const bodySchema = z.object({ force: z.boolean().optional() });

/**
 * POST /api/clients/[id]/brand-dna/abort-stuck
 *
 * Mark the latest in-flight Brand DNA job as failed and clear `clients.brand_dna_status`
 * from `generating` so the user can start again. By default only allowed when the job
 * looks stale (no row updates for BRAND_DNA_JOB_STALE_MS).
 *
 * @auth Required (admin)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: actor } = await admin.from('users').select('role').eq('id', user.id).single();
  if (!actor || actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let force = false;
  try {
    const json: unknown = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (parsed.success) force = parsed.data.force === true;
  } catch {
    /* empty body */
  }

  const { data: job } = await admin
    .from('brand_dna_jobs')
    .select('id, status, updated_at, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job || !isBrandDnaJobInFlightStatus(job.status)) {
    return NextResponse.json({ error: 'No in-flight Brand DNA job for this client' }, { status: 400 });
  }

  const touchIso =
    typeof job.updated_at === 'string' && job.updated_at.length > 0
      ? job.updated_at
      : (typeof job.created_at === 'string' ? job.created_at : null);
  const touchMs = touchIso ? new Date(touchIso).getTime() : 0;
  const stale = touchMs > 0 && Date.now() - touchMs >= BRAND_DNA_JOB_STALE_MS;

  if (!stale && !force) {
    return NextResponse.json(
      {
        error: 'This job still looks active. Wait a bit longer, or send {"force":true} to reset anyway.',
        stale_after_ms: BRAND_DNA_JOB_STALE_MS,
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  await admin
    .from('brand_dna_jobs')
    .update({
      status: 'failed',
      error_message:
        'Run stopped — no progress for a long time, manual reset, or AI request timed out. Start generation again.',
      updated_at: now,
    })
    .eq('id', job.id);

  await admin
    .from('clients')
    .update({ brand_dna_status: 'none' })
    .eq('id', clientId)
    .eq('brand_dna_status', 'generating');

  return NextResponse.json({ ok: true, jobId: job.id });
}
