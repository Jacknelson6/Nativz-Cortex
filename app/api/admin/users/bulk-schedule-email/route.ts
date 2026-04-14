import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveMergeContext } from '@/lib/email/resolve-merge-context';
import { resolveMergeFields } from '@/lib/email/merge-fields';

export const maxDuration = 30;

const Body = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(100),
  subject: z.string().min(1).max(200),
  body_markdown: z.string().min(1).max(10000),
  template_id: z.string().uuid().nullable().optional(),
  send_at: z.string().datetime(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const sendAt = new Date(parsed.data.send_at);
  if (sendAt.getTime() < Date.now() + 60_000) {
    return NextResponse.json({ error: 'send_at must be at least 1 minute in the future' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: recipients } = await admin
    .from('users')
    .select('id, email, full_name')
    .in('id', parsed.data.user_ids);

  if (!recipients || recipients.length === 0) {
    return NextResponse.json({ error: 'No recipients found' }, { status: 404 });
  }

  const scheduled: { user_id: string; id: string }[] = [];
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
    const frozenSubject = resolveMergeFields(parsed.data.subject, mergeContext);
    const frozenBody = resolveMergeFields(parsed.data.body_markdown, mergeContext);

    const { data, error } = await admin
      .from('scheduled_emails')
      .insert({
        recipient_id: recipient.id,
        template_id: parsed.data.template_id ?? null,
        subject: frozenSubject,
        body_markdown: frozenBody,
        send_at: sendAt.toISOString(),
        scheduled_by: auth.user.id,
      })
      .select('id')
      .single();

    if (error || !data) {
      failed.push({ user_id: recipient.id, error: error?.message ?? 'insert failed' });
    } else {
      scheduled.push({ user_id: recipient.id, id: data.id });
    }
  }

  return NextResponse.json({ scheduled, failed });
}
