import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendUserEmail } from '@/lib/email/send-user-email';
import { resolveMergeContext } from '@/lib/email/resolve-merge-context';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

export const maxDuration = 30;

const Body = z.object({
  subject: z.string().min(1).max(200),
  body_markdown: z.string().min(1).max(10000),
  template_id: z.string().uuid().nullable().optional(),
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

  const agency = detectAgencyFromHostname(request.headers.get('host') ?? '');

  const send = await sendUserEmail({
    to: recipient.email,
    subject: parsed.data.subject,
    bodyMarkdown: parsed.data.body_markdown,
    mergeContext,
    agency,
  });

  if (!send.ok) {
    console.warn('[send-email] failed for recipient', recipientId, send.error);
    return NextResponse.json({ error: send.error }, { status: 502 });
  }

  await admin.from('activity_log').insert({
    actor_id: auth.user.id,
    action: 'user_email_sent',
    entity_type: 'user',
    entity_id: recipientId,
    metadata: {
      template_id: parsed.data.template_id ?? null,
      subject: send.resolvedSubject,
      resend_id: send.id,
    },
  });

  return NextResponse.json({ ok: true, resend_id: send.id });
}
