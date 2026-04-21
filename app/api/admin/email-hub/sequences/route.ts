import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const AgencyEnum = z.enum(['nativz', 'anderson']);

const StepSchema = z.object({
  step_order: z.number().int().min(0),
  delay_days: z.number().int().min(0).default(0),
  subject: z.string().min(1),
  body_markdown: z.string().min(1),
  template_id: z.string().uuid().optional().nullable(),
  stop_on_reply: z.boolean().default(true),
});

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  agency: AgencyEnum.optional().nullable(),
  steps: z.array(StepSchema).min(1),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_sequences')
    .select(`
      id, name, description, agency, active, created_at, updated_at,
      steps:email_sequence_steps(id, step_order, delay_days, subject, stop_on_reply),
      enrollments:email_sequence_enrollments(count)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[email-hub/sequences] list failed:', error);
    return NextResponse.json({ error: 'Failed to load sequences' }, { status: 500 });
  }

  type SequenceRow = {
    id: string;
    name: string;
    description: string | null;
    agency: string | null;
    active: boolean;
    created_at: string;
    updated_at: string;
    steps: { id: string; step_order: number; delay_days: number; subject: string; stop_on_reply: boolean }[] | null;
    enrollments: { count: number }[] | null;
  };
  const sequences = ((data ?? []) as SequenceRow[]).map((s) => ({
    ...s,
    step_count: s.steps?.length ?? 0,
    enrollment_count: Array.isArray(s.enrollments) ? s.enrollments[0]?.count ?? 0 : 0,
  }));

  return NextResponse.json({ sequences });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: seq, error: seqErr } = await admin
    .from('email_sequences')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      agency: parsed.data.agency ?? null,
      created_by: auth.user.id,
    })
    .select('*')
    .single();

  if (seqErr || !seq) {
    console.warn('[email-hub/sequences] create failed:', seqErr);
    return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
  }

  const stepRows = parsed.data.steps.map((s) => ({
    sequence_id: seq.id,
    step_order: s.step_order,
    delay_days: s.delay_days,
    subject: s.subject,
    body_markdown: s.body_markdown,
    template_id: s.template_id ?? null,
    stop_on_reply: s.stop_on_reply,
  }));
  const { error: stepErr } = await admin.from('email_sequence_steps').insert(stepRows);
  if (stepErr) {
    console.warn('[email-hub/sequences] steps create failed:', stepErr);
    // Roll back the sequence so the user can try again cleanly
    await admin.from('email_sequences').delete().eq('id', seq.id);
    return NextResponse.json({ error: 'Failed to save sequence steps' }, { status: 500 });
  }

  return NextResponse.json({ sequence: seq }, { status: 201 });
}
