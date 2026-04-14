import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendUserEmail } from '@/lib/email/send-user-email';
import { resolveMergeContext } from '@/lib/email/resolve-merge-context';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

export const maxDuration = 60;

const Body = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(100),
  subject: z.string().min(1).max(200),
  body_markdown: z.string().min(1).max(10000),
  template_id: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: recipients } = await admin
    .from('users')
    .select('id, email, full_name')
    .in('id', parsed.data.user_ids);

  if (!recipients || recipients.length === 0) {
    return NextResponse.json({ error: 'No recipients found' }, { status: 404 });
  }

  const agency = detectAgencyFromHostname(request.headers.get('host') ?? '');
  const sent: { user_id: string; resend_id: string }[] = [];
  const failed: { user_id: string; error: string }[] = [];

  for (const recipient of recipients) {
    if (!recipient.email) {
      failed.push({ user_id: recipient.id, error: 'recipient has no email' });
      continue;
    }
    const mergeContext = await resolveMergeContext(admin, recipient, {
      id: auth.adminRow.id,
      email: auth.adminRow.email,
      full_name: auth.adminRow.full_name,
    });
    const send = await sendUserEmail({
      to: recipient.email,
      subject: parsed.data.subject,
      bodyMarkdown: parsed.data.body_markdown,
      mergeContext,
      agency,
    });
    if (send.ok) {
      sent.push({ user_id: recipient.id, resend_id: send.id });
      await admin.from('activity_log').insert({
        actor_id: auth.user.id,
        action: 'user_email_sent',
        entity_type: 'user',
        entity_id: recipient.id,
        metadata: {
          template_id: parsed.data.template_id ?? null,
          subject: send.resolvedSubject,
          resend_id: send.id,
        },
      });
    } else {
      failed.push({ user_id: recipient.id, error: send.error });
    }
  }

  return NextResponse.json({ sent, failed });
}
