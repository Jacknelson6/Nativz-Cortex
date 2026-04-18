/**
 * POST /api/submit-payroll/[token]/commit
 *
 * Public — token is the credential. Writes confirmed entries to
 * payroll_entries with team_member_id locked to the token's member and
 * period_id locked to the token's period. The submitter can't override
 * either field, so a compromised / shared token still can't attribute
 * entries to a different person or a different period.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const entrySchema = z.object({
  entry_type: z.enum(['editing', 'smm', 'affiliate', 'blogging']),
  client_id: z.string().uuid().nullable().optional(),
  video_count: z.number().int().min(0).max(10_000).optional(),
  rate_cents: z.number().int().min(0).max(10_000_000).optional(),
  amount_cents: z.number().int().min(0).max(10_000_000),
  description: z.string().max(2000).nullable().optional(),
});

const bodySchema = z.object({
  entries: z.array(entrySchema).min(1).max(200),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: tok } = await adminClient
    .from('payroll_submission_tokens')
    .select('id, period_id, team_member_id, expires_at, use_count')
    .eq('token', token)
    .single();
  if (!tok) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  if (new Date(tok.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 });
  }

  const { data: period } = await adminClient
    .from('payroll_periods')
    .select('status')
    .eq('id', tok.period_id)
    .single();
  if (!period) return NextResponse.json({ error: 'Period no longer exists' }, { status: 404 });
  if (period.status === 'paid') {
    return NextResponse.json(
      { error: 'This period has already been paid. Your admin needs to open a new one.' },
      { status: 400 },
    );
  }

  const rows = parsed.data.entries.map((e) => ({
    period_id: tok.period_id,
    entry_type: e.entry_type,
    team_member_id: tok.team_member_id, // server-locked
    payee_label: null,
    client_id: e.client_id ?? null,
    video_count: e.video_count ?? 0,
    rate_cents: e.rate_cents ?? 0,
    amount_cents: e.amount_cents,
    margin_cents: 0, // margin is admin-set, never submitted
    description: e.description ?? null,
    created_by: null,
  }));

  const { data, error } = await adminClient
    .from('payroll_entries')
    .insert(rows)
    .select('id, amount_cents');
  if (error) {
    console.error('[submit-payroll/commit] insert failed', error);
    return NextResponse.json({ error: 'Failed to save entries' }, { status: 500 });
  }

  // Touch the token usage counter so the admin can see activity.
  await adminClient
    .from('payroll_submission_tokens')
    .update({
      last_used_at: new Date().toISOString(),
      use_count: (tok.use_count ?? 0) + 1,
    })
    .eq('id', tok.id);

  return NextResponse.json({
    created: data?.length ?? 0,
    total_cents: (data ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0),
  });
}
