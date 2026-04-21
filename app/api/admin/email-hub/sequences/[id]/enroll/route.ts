import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const EnrollSchema = z.object({
  contact_ids: z.array(z.string().uuid()).optional(),
  list_id: z.string().uuid().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id: sequenceId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = EnrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: firstStep } = await admin
    .from('email_sequence_steps')
    .select('delay_days')
    .eq('sequence_id', sequenceId)
    .order('step_order')
    .limit(1)
    .maybeSingle();
  if (!firstStep) {
    return NextResponse.json(
      { error: 'Sequence has no steps configured' },
      { status: 400 },
    );
  }

  let contactIds = new Set<string>(parsed.data.contact_ids ?? []);
  if (parsed.data.list_id) {
    const { data: members } = await admin
      .from('email_list_members')
      .select('contact_id')
      .eq('list_id', parsed.data.list_id);
    for (const m of members ?? []) contactIds.add(m.contact_id);
  }

  if (contactIds.size === 0) {
    return NextResponse.json({ error: 'No contacts selected' }, { status: 400 });
  }

  const firstSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000);
  const rows = Array.from(contactIds).map((contact_id) => ({
    sequence_id: sequenceId,
    contact_id,
    current_step: 0,
    next_send_at: firstSendAt.toISOString(),
    status: 'active' as const,
    created_by: auth.user.id,
  }));

  // Upsert — the one_active partial unique index silently rejects duplicates
  const { data, error } = await admin
    .from('email_sequence_enrollments')
    .insert(rows)
    .select('id');
  if (error) {
    console.warn('[email-hub/sequences/enroll] failed:', error);
    // 23505 = unique_violation (one_active partial); tolerate partial success
    if (error.code !== '23505') {
      return NextResponse.json({ error: 'Failed to enroll contacts' }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    enrolled: data?.length ?? 0,
    requested: rows.length,
  });
}
