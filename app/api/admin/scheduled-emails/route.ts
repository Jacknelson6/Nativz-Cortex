import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('scheduled_emails')
    .select(`
      id, recipient_id, template_id, subject, body_markdown, send_at,
      status, sent_at, resend_id, failure_reason, scheduled_by, created_at,
      recipient:recipient_id ( id, email, full_name )
    `)
    .order('send_at', { ascending: true })
    .limit(500);

  if (error) {
    console.warn('[scheduled-emails] list failed:', error);
    return NextResponse.json({ error: 'Failed to load scheduled emails' }, { status: 500 });
  }
  return NextResponse.json({ scheduled: data ?? [] });
}
