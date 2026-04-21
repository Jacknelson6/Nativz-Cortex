import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  agency: z.enum(['nativz', 'anderson']).optional().nullable(),
  active: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const [seqRes, stepsRes, enrollmentsRes] = await Promise.all([
    admin
      .from('email_sequences')
      .select('id, name, description, agency, active, created_at, updated_at')
      .eq('id', id)
      .single(),
    admin
      .from('email_sequence_steps')
      .select('id, step_order, delay_days, subject, body_markdown, template_id, stop_on_reply')
      .eq('sequence_id', id)
      .order('step_order'),
    admin
      .from('email_sequence_enrollments')
      .select(`
        id, current_step, next_send_at, status, enrolled_at, completed_at, stopped_reason,
        contact:contact_id ( id, email, full_name )
      `)
      .eq('sequence_id', id)
      .order('enrolled_at', { ascending: false }),
  ]);

  if (seqRes.error || !seqRes.data) {
    return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
  }

  return NextResponse.json({
    sequence: seqRes.data,
    steps: stepsRes.data ?? [],
    enrollments: enrollmentsRes.data ?? [],
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_sequences')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) {
    console.warn('[email-hub/sequences] update failed:', error);
    return NextResponse.json({ error: 'Failed to update sequence' }, { status: 500 });
  }
  return NextResponse.json({ sequence: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from('email_sequences').delete().eq('id', id);
  if (error) {
    console.warn('[email-hub/sequences] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete sequence' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
