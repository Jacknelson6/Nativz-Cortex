import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveMergeContext } from '@/lib/email/resolve-merge-context';
import { resolveMergeFields } from '@/lib/email/merge-fields';

export const maxDuration = 15;

const Body = z.object({
  subject: z.string().min(1).max(200),
  body_markdown: z.string().min(1).max(10000),
  template_id: z.string().uuid().nullable().optional(),
  send_at: z.string().datetime(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id: recipientId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const sendAt = new Date(parsed.data.send_at);
  if (sendAt.getTime() < Date.now() + 60_000) {
    return NextResponse.json(
      { error: 'send_at must be at least 1 minute in the future; use /send-email to send now' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: recipient } = await admin
    .from('users')
    .select('id, email, full_name')
    .eq('id', recipientId)
    .single();

  if (!recipient) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
  if (!recipient.email) return NextResponse.json({ error: 'Recipient has no email address' }, { status: 400 });

  const mergeContext = await resolveMergeContext(admin, recipient, {
    id: auth.adminRow.id,
    email: auth.adminRow.email,
    full_name: auth.adminRow.full_name,
  });

  const frozenSubject = resolveMergeFields(parsed.data.subject, mergeContext);
  const frozenBody = resolveMergeFields(parsed.data.body_markdown, mergeContext);

  const { data, error } = await admin
    .from('scheduled_emails')
    .insert({
      recipient_id: recipientId,
      template_id: parsed.data.template_id ?? null,
      subject: frozenSubject,
      body_markdown: frozenBody,
      send_at: sendAt.toISOString(),
      scheduled_by: auth.user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.warn('[schedule-email] insert failed:', error);
    return NextResponse.json({ error: 'Failed to schedule' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
