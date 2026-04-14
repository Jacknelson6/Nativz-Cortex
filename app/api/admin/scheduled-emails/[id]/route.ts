import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const PatchSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  body_markdown: z.string().min(1).max(10000).optional(),
  send_at: z.string().datetime().optional(),
});

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
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }
  if (parsed.data.send_at && new Date(parsed.data.send_at).getTime() < Date.now() + 60_000) {
    return NextResponse.json({ error: 'send_at must be at least 1 minute in the future' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('scheduled_emails')
    .select('status')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: `Cannot edit ${existing.status} email` }, { status: 400 });
  }

  const { data, error } = await admin
    .from('scheduled_emails')
    .update(parsed.data)
    .eq('id', id)
    .select('id, recipient_id, subject, body_markdown, send_at, status')
    .single();

  if (error || !data) {
    console.warn('[scheduled-emails] update failed:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  return NextResponse.json({ scheduled: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = createAdminClient();

  // Soft delete — flip status to cancelled so the audit trail survives.
  const { error } = await admin
    .from('scheduled_emails')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending');

  if (error) {
    console.warn('[scheduled-emails] cancel failed:', error);
    return NextResponse.json({ error: 'Cancel failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
